ChemGame Builder v2.1 修复说明

1. BUILD.cmd 不再把全部 PowerShell 输出隐藏到 build_log.txt，构建过程会实时显示。
2. 下载 Electron 时会显示进度条，不会只停在 “Starting PowerShell builder...”。
3. 每一个下载源下载后立即检查文件大小和 SHA-256；无效则自动尝试下一个源。
4. 官方 Electron v43.2.0 Windows x64 文件：
   文件名：electron-v43.2.0-win32-x64.zip
   大小：144326439 bytes
   SHA-256：EBA5F5088AF40ECB364FE258809C79A5234C6ECE5A75C64722772EBA01B02786
5. 下载、解压和最终压缩阶段都会显示当前步骤提示。

使用：完整解压后双击 BUILD.cmd。
