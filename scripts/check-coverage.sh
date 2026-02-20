#!/usr/bin/env bash
set -euo pipefail

bun test --coverage --coverage-reporter=lcov

lcov_file="coverage/lcov.info"
if [[ ! -f "$lcov_file" ]]; then
  echo "Coverage file not found: $lcov_file"
  exit 1
fi

awk -F: '
  /^SF:/ {
    file = $2
    gsub(/\\/, "/", file)
    include = (file ~ /(^|\/)src\//) && (file !~ /\/node_modules\//)
  }
  /^LF:/ { if (include) lf += $2 }
  /^LH:/ { if (include) lh += $2 }
  /^FNF:/ { if (include) fnf += $2 }
  /^FNH:/ { if (include) fnh += $2 }
  /^BRF:/ { if (include) brf += $2 }
  /^BRH:/ { if (include) brh += $2 }
  END {
    if (lf == 0 && fnf == 0 && brf == 0) {
      print "Coverage failure: no matching src/* files in lcov report."
      exit 1
    }
    if (lf != lh || fnf != fnh || brf != brh) {
      printf("Coverage failure: lines %d/%d, functions %d/%d, branches %d/%d\n", lh, lf, fnh, fnf, brh, brf)
      exit 1
    }
    printf("Coverage OK: lines %d/%d, functions %d/%d, branches %d/%d\n", lh, lf, fnh, fnf, brh, brf)
  }
' "$lcov_file"
