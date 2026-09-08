# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['/home/runner/workspace/main.py'],
    pathex=[],
    binaries=[],
    datas=[('/home/runner/workspace/artifacts/interview-helper/public/pixel-agents', 'pixel-agents'), ('/home/runner/workspace/godot/office-client/floor_plan.json', 'godot/office-client')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['pkg_resources', 'setuptools'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='SALARYMAN Office',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='SALARYMAN Office',
)
