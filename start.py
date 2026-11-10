#!/usr/bin/env python3
"""Запуск из любой папки: python3 start.py."""
import os,sys
from pathlib import Path
os.chdir(Path(__file__).resolve().parent)
from backend.server import main
if __name__=='__main__':main()
