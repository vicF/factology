#!/usr/bin/env bash
# ================================================================
#  Reset admin password — runs inside the factology container.
#
#  Usage:
#    ./bin/reset-admin-password.sh                    # first admin
#    ./bin/reset-admin-password.sh admin@example.com  # specific admin
# ================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

EMAIL="${1:-}"

COLOR_RESET='\033[0m'; COLOR_GREEN='\033[0;32m'; COLOR_YELLOW='\033[1;33m'; COLOR_CYAN='\033[0;36m'; COLOR_BOLD='\033[1m'

step() { echo -e "\n${COLOR_CYAN}==>${COLOR_RESET} ${COLOR_BOLD}$1${COLOR_RESET}"; }

step "Resetting admin password"

CMD="php artisan factology:reset-admin-password"
if [ -n "$EMAIL" ]; then
    CMD="$CMD --email=$EMAIL"
fi

docker compose exec factology-app $CMD

echo ""
echo -e "${COLOR_GREEN}${COLOR_BOLD}  Password reset complete.${COLOR_RESET}"
echo -e "  ${COLOR_YELLOW}Save the password shown above — it will not be shown again.${COLOR_RESET}"
echo ""
