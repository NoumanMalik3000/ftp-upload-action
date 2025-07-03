# Simple FTP Upload

This GitHub Action uploads folder contents directly to an FTP server, overwriting existing files on the server.

> **Note:**  
> This Action uploads files without maintaining sync state. If you require sync capabilities, consider using [NoumanMalik3000/FTP-Upload-Action](https://github.com/NoumanMalik3000/ftp-upload-action) instead.

---

## Tested and Verified on

| Operating System  | Status  |
|-------------------|---------|
| ubuntu-latest     | ✔️      |
| windows-latest    | ✔️      |
| macos-latest      | ✔️      |

---

## Inputs

| Input Name   | Description                                             | Required | Default |
|--------------|---------------------------------------------------------|----------|---------|
| `server`     | FTP server hostname or IP                               | Yes      | —       |
| `username`   | FTP username                                            | Yes      | —       |
| `password`   | FTP password                                            | Yes      | —       |
| `port`       | FTP port number                                        | No       | 21      |
| `secure`     | Use FTPS (`true`) or plain FTP (`false`)               | No       | true    |
| `local_dir`  | Local folder path to upload from (must end with `/`)   | No       | `./`    |
| `server_dir` | Remote server directory to upload to (must end with `/`)| No       | `./`    |

---

## Basic Usage

```yaml
steps:
  - uses: actions/checkout@v4

  - name: Upload files via FTP
    uses: NoumanMalik3000/ftp-upload-action@v1
    with:
      server: ${{ secrets.FTP_SERVER }}
      username: ${{ secrets.FTP_USER }}
      password: ${{ secrets.FTP_PASSWORD }}
      local_dir: ./          # Local folder to upload, must end with '/'
      server_dir: ./         # Remote folder on FTP server, must end with '/'
