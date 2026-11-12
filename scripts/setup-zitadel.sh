#!/usr/bin/env bash
set -euo pipefail

# Automated Zitadel OIDC setup for krantho testing
# Prerequisites: docker compose -f docker-compose.zitadel.yml up -d --wait

ZITADEL_URL="http://localhost:8080"
REDIRECT_URI="http://localhost:4002/api/auth/callback"
POST_LOGOUT_URI="http://localhost:4002/studio/"

echo "=== Zitadel OIDC Setup for Krantho ==="

# Wait for Zitadel to be ready
echo "Waiting for Zitadel..."
RETRIES=0
until curl -sf "$ZITADEL_URL/debug/ready" > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge 60 ]; then
    echo "ERROR: Zitadel not ready after 60s"
    exit 1
  fi
  sleep 1
done
echo "Zitadel is ready"

# Read PAT
PAT_FILE=".zitadel/zitadel-admin-sa.pat"
echo "Reading PAT from $PAT_FILE..."
if [ ! -f "$PAT_FILE" ]; then
  echo "ERROR: PAT file not found. Is Zitadel running?"
  exit 1
fi
PAT=$(cat "$PAT_FILE")
if [ -z "$PAT" ]; then
  echo "ERROR: PAT file is empty."
  exit 1
fi
echo "Authenticated via PAT"

# API helper
zapi() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

  if [ -n "$body" ]; then
    curl -sf -X "$method" "$ZITADEL_URL$path" \
      -H "Authorization: Bearer $PAT" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -sf -X "$method" "$ZITADEL_URL$path" \
      -H "Authorization: Bearer $PAT"
  fi
}

# Wait for management API
echo "Waiting for management API..."
RETRIES=0
until zapi POST "/management/v1/projects/_search" '{"queries":[]}' > /dev/null 2>&1; do
  RETRIES=$((RETRIES + 1))
  if [ "$RETRIES" -ge 30 ]; then
    echo "ERROR: Management API not ready after 30s"
    exit 1
  fi
  sleep 1
done
echo "Management API ready"

# Create project
echo ""
echo "Setting up project..."
EXISTING=$(zapi POST "/management/v1/projects/_search" \
  '{"queries":[{"nameQuery":{"name":"krantho","method":"TEXT_QUERY_METHOD_EQUALS"}}]}')

PROJECT_COUNT=$(echo "$EXISTING" | jq -r '.result | length // 0')
if [ "$PROJECT_COUNT" -gt 0 ]; then
  PROJECT_ID=$(echo "$EXISTING" | jq -r '.result[0].id')
  echo "  Project 'krantho' already exists (ID: $PROJECT_ID)"
else
  RESPONSE=$(zapi POST "/management/v1/projects" '{"name":"krantho"}')
  PROJECT_ID=$(echo "$RESPONSE" | jq -r '.id')
  echo "  Created project 'krantho' (ID: $PROJECT_ID)"
fi

# Create OIDC application
echo "Setting up OIDC application..."
EXISTING_APPS=$(zapi POST "/management/v1/projects/$PROJECT_ID/apps/_search" \
  '{"queries":[{"nameQuery":{"name":"krantho-admin","method":"TEXT_QUERY_METHOD_EQUALS"}}]}')

APP_COUNT=$(echo "$EXISTING_APPS" | jq -r '.result | length // 0')
if [ "$APP_COUNT" -gt 0 ]; then
  CLIENT_ID=$(echo "$EXISTING_APPS" | jq -r '.result[0].oidcConfig.clientId')
  echo "  Application 'krantho-admin' already exists (Client ID: $CLIENT_ID)"
else
  APP_RESPONSE=$(zapi POST "/management/v1/projects/$PROJECT_ID/apps/oidc" \
    "{
      \"name\": \"krantho-admin\",
      \"redirectUris\": [\"$REDIRECT_URI\"],
      \"postLogoutRedirectUris\": [\"$POST_LOGOUT_URI\"],
      \"responseTypes\": [\"OIDC_RESPONSE_TYPE_CODE\"],
      \"grantTypes\": [\"OIDC_GRANT_TYPE_AUTHORIZATION_CODE\"],
      \"appType\": \"OIDC_APP_TYPE_WEB\",
      \"authMethodType\": \"OIDC_AUTH_METHOD_TYPE_NONE\",
      \"accessTokenType\": \"OIDC_TOKEN_TYPE_JWT\",
      \"devMode\": true
    }")
  CLIENT_ID=$(echo "$APP_RESPONSE" | jq -r '.clientId')
  echo "  Created OIDC application (Client ID: $CLIENT_ID)"
fi

# Harden the org login policy to match krantho's login-only model: password
# login for the pre-seeded users, but no self-registration and no external IdPs
# — the only accounts that exist are the ones seeded below (frinkel pattern).
#
# A fresh org inherits the instance default policy and has no custom one, so PUT
# fails with "Login Policy not found". Create it with POST first; on subsequent
# runs the custom policy exists, so fall back to PUT to update it.
echo "Hardening login policy (disable self-registration)..."
# The lifetime fields are REQUIRED: creating a custom org login policy does not
# inherit the instance defaults for them, so any omitted duration becomes 0s. A
# passwordCheckLifetime of 0s expires the password check immediately, so the
# hosted login re-prompts for the password forever (POST /password returns 200
# instead of redirecting). These values mirror Zitadel's instance defaults.
LOGIN_POLICY='{
  "allowUsernamePassword": true,
  "allowRegister": false,
  "allowExternalIdp": false,
  "forceMfa": false,
  "passwordlessType": "PASSWORDLESS_TYPE_NOT_ALLOWED",
  "hidePasswordReset": false,
  "passwordCheckLifetime": "864000s",
  "externalLoginCheckLifetime": "864000s",
  "mfaInitSkipLifetime": "2592000s",
  "secondFactorCheckLifetime": "64800s",
  "multiFactorCheckLifetime": "43200s"
}'
# Create the custom policy (POST) or update it (PUT). Both "already exists" and
# "not changed" are success states, so we don't trust the write's exit code —
# we verify the end state below. (proto3 JSON omits false booleans, so a missing
# allowRegister means false.)
zapi POST "/management/v1/policies/login" "$LOGIN_POLICY" > /dev/null 2>&1 \
  || zapi PUT "/management/v1/policies/login" "$LOGIN_POLICY" > /dev/null 2>&1 || true
ALLOW_REGISTER=$(zapi GET "/management/v1/policies/login" | jq -r '.policy.allowRegister // false')
if [ "$ALLOW_REGISTER" = "false" ]; then
  echo "  Self-registration disabled"
else
  echo "  WARNING: self-registration is still enabled"
fi

# Create test users
create_user() {
  local email="$1"
  local password="$2"
  local first_name="$3"
  local last_name="$4"

  EXISTING=$(zapi POST "/management/v1/users/_search" \
    "{\"queries\":[{\"emailQuery\":{\"emailAddress\":\"$email\",\"method\":\"TEXT_QUERY_METHOD_EQUALS\"}}]}")
  USER_COUNT=$(echo "$EXISTING" | jq -r '.result | length // 0')

  if [ "$USER_COUNT" -gt 0 ]; then
    echo "  User $email already exists"
    return
  fi

  zapi POST "/v2/users/human" \
    "{
      \"username\": \"$email\",
      \"profile\": { \"givenName\": \"$first_name\", \"familyName\": \"$last_name\" },
      \"email\": { \"email\": \"$email\", \"isVerified\": true },
      \"password\": { \"password\": \"$password\", \"changeRequired\": false }
    }" > /dev/null
  echo "  Created user $email"
}

echo "Setting up test users..."
create_user "admin@krantho.com" "Password1!" "Krantho" "Admin"
create_user "editor@krantho.com" "Password1!" "Test" "Editor"
create_user "viewer@krantho.com" "Password1!" "Test" "Viewer"

# Write env file (no comments — compatible with env $(cat .env.zitadel | xargs))
cat > .env.zitadel <<EOF
KRANTHO_AUTH=oidc
OIDC_ISSUER_URL=http://localhost:8080
OIDC_CLIENT_ID=$CLIENT_ID
OIDC_REDIRECT_URI=$REDIRECT_URI
OIDC_POST_LOGOUT_URI=$POST_LOGOUT_URI
KRANTHO_JWT_SECRET=dev-secret-for-local-testing-only
KRANTHO_ADMIN_EMAILS=admin@krantho.com
KRANTHO_SIGNUP=open
EOF

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Zitadel Console:  $ZITADEL_URL"
echo "Client ID:        $CLIENT_ID"
echo ""
echo "Test users (all password: Password1!):"
echo "  admin@krantho.com   — default admin (via KRANTHO_ADMIN_EMAILS)"
echo "  editor@krantho.com  — will get viewer role (assign editor in Studio)"
echo "  viewer@krantho.com  — will get viewer role"
echo ""
echo "Auth model: Zitadel is login-only; krantho owns users + roles."
echo "  Self-registration is disabled on Zitadel — only the seeded users exist."
echo "  Local uses KRANTHO_SIGNUP=open so seeded users just-in-time provision into"
echo "  krantho's DB on first login. In production use KRANTHO_SIGNUP=closed and"
echo "  pre-provision users (unknown OIDC logins are then rejected)."
echo ""
echo "Start krantho:"
echo "  env \$(cat .env.zitadel | xargs) pnpm --filter @krantho/example-nextjs-shadcn run dev --port 4002"
