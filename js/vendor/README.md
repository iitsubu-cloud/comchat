# js/vendor — 同梱している外部ライブラリ

CDN を単一障害点にしないため、外部ライブラリはここに同梱して相対パスで読み込む。
差し替えるときは必ず npm レジストリの `integrity` を検証してから入れ替えること。

| ファイル | ライブラリ | バージョン | sha256 | 取得元 |
|---|---|---|---|---|
| `peerjs.min.js` | PeerJS | 1.5.0 | `61f3526f0507940e54b14dc1686a94ad3da6c598af353e3dc4323d7363e178ce` | npm `peerjs@1.5.0` の `dist/peerjs.min.js`（未改変・バイト同一） |
| `qrcode.js` | qrcodejs | — | — | 以前のセッションで同梱 |

## peerjs.min.js の検証手順

```sh
# npm 公式の integrity と一致することを確認する
curl -s https://registry.npmjs.org/peerjs/1.5.0 \
  | python3 -c "import sys,json;d=json.load(sys.stdin)['dist'];print(d['tarball'],d['integrity'])"
# tarball を落として sha512 を突き合わせ、package/dist/peerjs.min.js を取り出す

# 同梱物のハッシュ
shasum -a 256 js/vendor/peerjs.min.js
```

`peerjs.min.js` は末尾に `sourceMappingURL=peerjs.min.js.map` を含むが、
map ファイル（615KB＝本体の約5倍）は同梱していない。
DevTools を開いたときだけ 404 が出るが動作には影響しない。
