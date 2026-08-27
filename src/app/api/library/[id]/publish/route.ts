import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api/error-handler';
import { getCurrentUser } from '@/lib/auth/middleware';
import { getLibraryAd } from '@/lib/library/store';
import { markLibraryAdOnline, setLibraryPublishJob } from '@/lib/library/store';
import { buildLibraryPublishPlan, cleanupFailedLibraryDraft, findPublishedLibraryAd, prepareLibraryDraft, reconcilePublishedLibraryAd } from '@/lib/library/publish';
import { fetchKaAds } from '@/lib/ka/management-api';
import { startJob, jobs, withUserLabel } from '@/lib/bot/jobs';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const user = await getCurrentUser(request);
    const { id } = await params;
    const ad = getLibraryAd(user.userWorkspace, id);
    if (!ad) return NextResponse.json({ detail: 'Vorlage nicht gefunden' }, { status: 404 });
    const plan = buildLibraryPublishPlan(user.userWorkspace, ad);
    let onlineBefore: Awaited<ReturnType<typeof fetchKaAds>> = [];
    if (plan.ready && plan.workspace) {
      try { onlineBefore = await fetchKaAds(plan.workspace); } catch { plan.errors.push('Die Kleinanzeigen-Session des ausgewählten Kontos ist nicht mehr gültig.'); plan.ready = false; }
    }
    if (!plan.ready) return NextResponse.json({ ready: false, errors: plan.errors, detail: plan.errors.join(' ') }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    if (body.confirm !== true) {
      return NextResponse.json({ ready: true, account_id: plan.accountId, account_name: plan.accountName, title: ad.title, image_count: ad.images.length });
    }

    prepareLibraryDraft(user.userWorkspace, ad, plan);
    try {
      const job = startJob('publish --ads=new', plan.workspace!, user.id);
      setLibraryPublishJob(user.userWorkspace, ad.id, job.job_id, onlineBefore.map((item) => item.id), job.started_at);
      return NextResponse.json({ ready: true, job: withUserLabel(job) }, { status: 202 });
    } catch (error) {
      cleanupFailedLibraryDraft(plan.workspace!, ad.id);
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const user = await getCurrentUser(request);
    const { id } = await params;
    const ad = getLibraryAd(user.userWorkspace, id);
    if (!ad) return NextResponse.json({ detail: 'Vorlage nicht gefunden' }, { status: 404 });
    if (!ad.publish_job_id) return NextResponse.json({ job: null, ad });
    const job = jobs.get(ad.publish_job_id);
    if (!job) return NextResponse.json({ job: null, ad, detail: 'Jobstatus ist nach einem Serverneustart nicht mehr verfügbar.' });
    if (job.status === 'failed' || job.status === 'login_required') {
      cleanupFailedLibraryDraft(job.workspace, ad.id);
      return NextResponse.json({ job: withUserLabel(job), ad, error: job.output.trim() || 'Veröffentlichung fehlgeschlagen.' });
    }
    if (job.status === 'completed' || job.status === 'completed_with_errors') {
      const published = findPublishedLibraryAd(job.workspace, ad.id, ad.title, ad.category);
      const onlineAds = await fetchKaAds(job.workspace).catch(() => []);
      const reconciled = reconcilePublishedLibraryAd(ad, onlineAds);
      if (reconciled.ambiguous) {
        return NextResponse.json({ job: withUserLabel(job), ad, error: 'Mehrere neue Anzeigen stimmen mit Titel und Preis überein. Keine automatische Zuordnung vorgenommen.' });
      }
      const online = (published ? onlineAds.find((item) => item.id === published.id) : null) ?? reconciled.ad;
      const publishedId = published?.id ?? online?.id;
      if (!publishedId) {
        const finishedAt = Date.parse(job.finished_at || job.started_at);
        if (Date.now() - finishedAt < 120_000) {
          return NextResponse.json({ job: withUserLabel(job), ad, reconciling: true, detail: 'Kleinanzeigen wird noch auf eine neue Anzeige geprüft.' });
        }
        cleanupFailedLibraryDraft(job.workspace, ad.id);
        const cleared = setLibraryPublishJob(user.userWorkspace, ad.id, null) ?? ad;
        return NextResponse.json({ job: withUserLabel(job), ad: cleared, definitely_not_created: true, retry_allowed: true, error: 'Die Anzeige wurde nach dem Submit weder online noch als verwaltete Anzeige gefunden. Ein einzelner kontrollierter Neuversuch ist zulässig.' });
      }
      const rawUrl = online?.seoUrl;
      const url = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `https://www.kleinanzeigen.de${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`) : `https://www.kleinanzeigen.de/s-anzeige/${publishedId}`;
      const updated = markLibraryAdOnline(user.userWorkspace, ad.id, publishedId, url) ?? ad;
      return NextResponse.json({ job: withUserLabel(job), ad: updated, recovered_after_submit: !published });
    }
    return NextResponse.json({ job: withUserLabel(job), ad });
  } catch (error) {
    return handleApiError(error);
  }
}
