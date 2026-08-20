"""Multi-account Kleinanzeigen management architecture tests.

Tests validate account CRUD, x-account-id routing, credential/session isolation,
template independence, and aggregate endpoints — NOT live KA automation.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

APP_EMAIL = "admin@local.test"
APP_PASS = "adminpass123"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": APP_EMAIL, "password": APP_PASS}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token") or (data.get("data") or {}).get("token")
    assert tok, f"no token in response: {data}"
    return tok


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _hdr(auth, account_id=None):
    h = dict(auth)
    if account_id:
        h["x-account-id"] = account_id
    return h


# ---------- Auth ----------
class TestAuth:
    def test_login_returns_token(self, token):
        assert isinstance(token, str) and len(token) > 10


# ---------- Accounts CRUD ----------
class TestAccounts:
    created_ids = []

    def test_list_accounts_has_default(self, auth_headers):
        r = requests.get(f"{API}/accounts", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        accounts = data.get("accounts") if isinstance(data, dict) else data
        assert isinstance(accounts, list) and len(accounts) >= 1
        default = next((a for a in accounts if a.get("id") == "default"), None)
        assert default is not None, f"no default account: {accounts}"
        # Verify fields
        assert "login_status" in default, default
        assert "ad_count" in default, default

    def test_create_multiple_accounts(self, auth_headers):
        for name in ["BerlinBrick", "HamburgHaus", "MunichMart"]:
            r = requests.post(f"{API}/accounts", headers=auth_headers,
                              json={"display_name": name}, timeout=15)
            assert r.status_code in (200, 201), f"{name}: {r.status_code} {r.text}"
            body = r.json()
            acc = body.get("account") if isinstance(body, dict) else None
            assert acc and acc.get("id"), f"no id in response: {body}"
            TestAccounts.created_ids.append(acc["id"])
        # verify listed
        r = requests.get(f"{API}/accounts", headers=auth_headers, timeout=15)
        listed_ids = [a["id"] for a in (r.json().get("accounts") or [])]
        for cid in TestAccounts.created_ids:
            assert cid in listed_ids

    def test_credential_isolation(self, auth_headers):
        assert TestAccounts.created_ids, "need created accounts"
        acc_id = TestAccounts.created_ids[0]
        # PUT creds on new account
        r = requests.put(f"{API}/accounts/{acc_id}/credentials", headers=auth_headers,
                         json={"username": "brick@x.test", "password": "pw1"}, timeout=15)
        assert r.status_code in (200, 204), r.text

        # GET config with x-account-id -> should return brick@x.test
        r = requests.get(f"{API}/system/config", headers=_hdr(auth_headers, acc_id), timeout=15)
        assert r.status_code == 200, r.text
        cfg = r.json()
        # navigate to login.username
        login = (cfg.get("login") or (cfg.get("config") or {}).get("login") or {})
        assert login.get("username") == "brick@x.test", f"expected brick@x.test, got {cfg}"

        # GET config for default (no header)
        r_def = requests.get(f"{API}/system/config", headers=auth_headers, timeout=15)
        assert r_def.status_code == 200, r_def.text
        cfg_def = r_def.json()
        login_def = (cfg_def.get("login") or (cfg_def.get("config") or {}).get("login") or {})
        default_username = login_def.get("username")
        assert default_username != "brick@x.test", \
            f"credential leaked into default account: {default_username}"

    def test_app_login_still_works_after_creds(self, auth_headers):
        # setting KA credentials must NOT change users.yaml app login
        r = requests.post(f"{API}/auth/login",
                          json={"email": APP_EMAIL, "password": APP_PASS}, timeout=15)
        assert r.status_code == 200, r.text
        assert (r.json().get("token") or r.json().get("access_token"))

    def test_rename_account(self, auth_headers):
        acc_id = TestAccounts.created_ids[1]
        r = requests.put(f"{API}/accounts/{acc_id}", headers=auth_headers,
                         json={"display_name": "Renamed"}, timeout=15)
        assert r.status_code in (200, 204), r.text
        r = requests.get(f"{API}/accounts", headers=auth_headers, timeout=15)
        acc = next((a for a in r.json().get("accounts", []) if a["id"] == acc_id), None)
        assert acc and acc.get("display_name") == "Renamed", acc

    def test_disconnect(self, auth_headers):
        acc_id = TestAccounts.created_ids[0]
        r = requests.post(f"{API}/accounts/{acc_id}/disconnect",
                          headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True or "login_status" in body, body

    def test_default_account_cannot_be_deleted(self, auth_headers):
        r = requests.delete(f"{API}/accounts/default", headers=auth_headers, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_delete_non_default(self, auth_headers):
        acc_id = TestAccounts.created_ids[-1]
        r = requests.delete(f"{API}/accounts/{acc_id}", headers=auth_headers, timeout=15)
        assert r.status_code in (200, 204), r.text
        r = requests.get(f"{API}/accounts", headers=auth_headers, timeout=15)
        ids = [a["id"] for a in r.json().get("accounts", [])]
        assert acc_id not in ids


# ---------- Templates independence ----------
class TestTemplates:
    def test_templates_same_across_accounts(self, auth_headers):
        assert TestAccounts.created_ids, "need accounts"
        acc_a = TestAccounts.created_ids[0]
        # Use whichever second id still exists
        acc_b = "default"

        r_a = requests.get(f"{API}/templates", headers=_hdr(auth_headers, acc_a), timeout=15)
        r_b = requests.get(f"{API}/templates", headers=_hdr(auth_headers, acc_b), timeout=15)
        assert r_a.status_code == 200 and r_b.status_code == 200, (r_a.text, r_b.text)
        a_list = r_a.json().get("templates", r_a.json()) if isinstance(r_a.json(), dict) else r_a.json()
        b_list = r_b.json().get("templates", r_b.json()) if isinstance(r_b.json(), dict) else r_b.json()
        # normalize
        def _slugs(x):
            if isinstance(x, list):
                return sorted([(t.get("slug") or t.get("id") or t.get("name")) for t in x if isinstance(t, dict)])
            return []
        assert _slugs(a_list) == _slugs(b_list), f"templates differ: {a_list} vs {b_list}"


# ---------- Aggregates ----------
class TestAggregates:
    def test_accounts_overview(self, auth_headers):
        r = requests.get(f"{API}/accounts/overview", headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        totals = data.get("totals") or {}
        for key in ["accounts", "connected", "active_ads", "unread", "automations"]:
            assert key in totals, f"missing totals.{key}: {data}"
        assert isinstance(data.get("accounts"), list)
        assert isinstance(data.get("recent_ads"), list)

    def test_inbox_aggregation(self, auth_headers):
        r = requests.get(f"{API}/inbox", headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "conversations" in data
        assert isinstance(data["conversations"], list)
        assert "numUnreadMessages" in data or "num_unread_messages" in data
        assert "errors" in data and isinstance(data["errors"], list)


# ---------- Regression ----------
class TestRegression:
    def test_health(self):
        r = requests.get(f"{API}/system/health", timeout=10)
        assert r.status_code == 200

    def test_ads(self, auth_headers):
        r = requests.get(f"{API}/ads", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text

    def test_system_config(self, auth_headers):
        r = requests.get(f"{API}/system/config", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
