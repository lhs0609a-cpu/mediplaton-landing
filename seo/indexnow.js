/**
 * IndexNow 색인 요청 — Bing · Naver · Yandex · Seznam 에 URL 변경을 즉시 통보한다.
 * (구글은 IndexNow 미지원 → Search Console 에서 별도 처리)
 *
 * 사용법
 *   node seo/indexnow.js            sitemap.xml 의 전체 URL 제출
 *   node seo/indexnow.js --new      정보센터 문서(pages.js) URL 만 제출
 *   node seo/indexnow.js --dry      실제 전송 없이 대상만 출력
 *
 * 사전 조건: 루트에 <KEY>.txt 파일이 배포되어 있어야 한다 (키와 동일한 내용).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const HOST = 'loan.brandplaton.com';
const SITE = `https://${HOST}`;
const KEY = fs.readFileSync(path.join(__dirname, 'indexnow.key'), 'utf8').trim();

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const onlyNew = args.includes('--new');

// ── 제출 대상 URL 수집 ──────────────────────────────────────
let urls;
if (onlyNew) {
    const pages = require('./pages.js');
    urls = [`${SITE}/loan-info.html`].concat(pages.map((p) => `${SITE}/${p.slug}.html`));
} else {
    const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
    urls = (xml.match(/<loc>([^<]+)<\/loc>/g) || []).map((m) => m.replace(/<\/?loc>/g, ''));
}
urls = [...new Set(urls)];

console.log(`제출 대상 ${urls.length}건 (key=${KEY.slice(0, 8)}…)`);
if (dry) {
    urls.slice(0, 10).forEach((u) => console.log('  ', u));
    if (urls.length > 10) console.log(`   … 외 ${urls.length - 10}건`);
    process.exit(0);
}

// ── IndexNow 는 1회 최대 10,000 URL. 안전하게 1,000 단위로 나눈다 ──
const CHUNK = 1000;
const chunks = [];
for (let i = 0; i < urls.length; i += CHUNK) chunks.push(urls.slice(i, i + CHUNK));

function submit(chunk, idx) {
    return new Promise((resolve) => {
        const body = JSON.stringify({
            host: HOST,
            key: KEY,
            keyLocation: `${SITE}/${KEY}.txt`,
            urlList: chunk,
        });
        const req = https.request(
            {
                hostname: 'api.indexnow.org',
                path: '/indexnow',
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) },
            },
            (res) => {
                let data = '';
                res.on('data', (d) => (data += d));
                res.on('end', () => {
                    // 200/202 = 접수, 4xx = 키·호스트 문제
                    console.log(`  [${idx + 1}/${chunks.length}] ${chunk.length}건 → HTTP ${res.statusCode} ${data.slice(0, 200)}`);
                    resolve(res.statusCode);
                });
            }
        );
        req.on('error', (e) => {
            console.log(`  [${idx + 1}/${chunks.length}] 전송 실패: ${e.message}`);
            resolve(0);
        });
        req.write(body);
        req.end();
    });
}

(async () => {
    const codes = [];
    for (let i = 0; i < chunks.length; i++) codes.push(await submit(chunks[i], i));
    const ok = codes.filter((c) => c === 200 || c === 202).length;
    console.log(`\n완료 — ${ok}/${chunks.length} 배치 접수됨`);
    if (ok < chunks.length) {
        console.log('실패한 배치가 있습니다. 키 파일이 배포되었는지 확인하세요:');
        console.log(`  ${SITE}/${KEY}.txt`);
    }
})();
