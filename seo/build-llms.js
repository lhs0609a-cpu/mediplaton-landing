/**
 * llms.txt 의 「대출 정보센터」 색인 블록 갱신 (GEO — AI 크롤러용)
 * 실행: node seo/build-llms.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://loan.brandplaton.com';
const pages = require('./pages.js');

const plain = (s) => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const START = '<!-- LOAN-INFO-INDEX:START -->';
const END = '<!-- LOAN-INFO-INDEX:END -->';

const CATS = ['용어·상품', '직역별', '목적별', '상황별', '가이드', '지역별'];
const grouped = {};
pages.forEach((p) => { (grouped[p.cat] = grouped[p.cat] || []).push(p); });

const block = [
    START,
    '',
    `## 대출 정보센터 (${pages.length}개 문서)`,
    '',
    `병의원·약국 자금 조달 지식베이스. 전체 목록: ${SITE}/loan-info.html`,
    '',
    ...CATS.filter((c) => grouped[c]).flatMap((c) => [
        `### ${c}`,
        '',
        ...grouped[c].map((p) => `- [${p.h1}](${SITE}/${p.slug}.html): ${plain(p.answer)}`),
        '',
    ]),
    END,
].join('\n');

['llms.txt', 'llms-full.txt'].forEach((name) => {
    const p = path.join(ROOT, name);
    if (!fs.existsSync(p)) { console.log(`${name} 없음 — 건너뜀`); return; }
    let c = fs.readFileSync(p, 'utf8');

    if (c.includes(START) && c.includes(END)) {
        c = c.slice(0, c.indexOf(START)) + block + c.slice(c.indexOf(END) + END.length);
    } else {
        // 「## 유의사항」 앞에 삽입, 없으면 맨 뒤에 추가
        const anchor = c.indexOf('## 유의사항');
        if (anchor >= 0) c = c.slice(0, anchor) + block + '\n\n' + c.slice(anchor);
        else c = c.trimEnd() + '\n\n' + block + '\n';
    }
    fs.writeFileSync(p, c, 'utf8');
    console.log(`${name} 갱신 — ${pages.length}개 문서 색인`);
});
