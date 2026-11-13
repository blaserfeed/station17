#!/bin/zsh
cd "${0:A:h}"
if [[ ! -d dist/TIMELESS.app ]]; then
  printf '%s\n' 'Распакуйте TIMELESS-Desktop-macOS-arm64.zip в папку dist.'
  exit 1
fi
open dist/TIMELESS.app
