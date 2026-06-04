// 测试单字答案的匹配问题
const fs = require('fs');

const words = JSON.parse(fs.readFileSync('./words.json', 'utf8'));

const testCases = [
    { meaning: '在…之前', answer: '在之前', shouldMatch: true },
    { meaning: '在…之前', answer: '在...之前', shouldMatch: true },
    { meaning: '在…之前', answer: '在什么之前', shouldMatch: true },
    { meaning: '在…之前', answer: '之前', shouldMatch: true },
    { meaning: '在…之前', answer: '在之前的', shouldMatch: false },
    { meaning: '在…之前', answer: '之前的', shouldMatch: false },
    
    { meaning: 'conj. 和，与；而且；然后；就；但是', answer: '和', shouldMatch: true },
    { meaning: 'conj. 和，与；而且；然后；就；但是', answer: '而且', shouldMatch: true },
    { meaning: 'conj. 和，与；而且；然后；就；但是', answer: '和与', shouldMatch: true },
    { meaning: 'conj. 和，与；而且；然后；就；但是', answer: '或者', shouldMatch: false },
    { meaning: 'conj. 和，与；而且；然后；就；但是', answer: '和你', shouldMatch: false },
    
    { meaning: 'prep. 在，存在；是', answer: '存在', shouldMatch: true },
    { meaning: 'prep. 在，存在；是', answer: '在', shouldMatch: true },
    { meaning: 'prep. 在，存在；是', answer: '是', shouldMatch: true },
    { meaning: 'prep. 在，存在；是', answer: '在于', shouldMatch: false },
    
    { meaning: 'pron. 他们；她们；它们', answer: '他们', shouldMatch: true },
    { meaning: 'pron. 他们；她们；它们', answer: '她们', shouldMatch: true },
    { meaning: 'pron. 他们；她们；它们', answer: '他们的', shouldMatch: false },
    
    { meaning: 'pron. 它', answer: '它', shouldMatch: true },
    { meaning: 'pron. 它', answer: '他', shouldMatch: false },
    
    { meaning: 'prep. 在…之内；从事于；按照（表示方式）', answer: '之内', shouldMatch: true },
    { meaning: 'prep. 在…之内；从事于；按照（表示方式）', answer: '从事', shouldMatch: true },
    { meaning: 'prep. 在…之内；从事于；按照（表示方式）', answer: '按照', shouldMatch: true },
    { meaning: 'prep. 在…之内；从事于；按照（表示方式）', answer: '表示方式', shouldMatch: true },
    { meaning: 'prep. 在…之内；从事于；按照（表示方式）', answer: '方式', shouldMatch: true },
];

function stripPosTag(s) {
    return s.replace(/^(n|v|vt|vi|adj|adv|pron|prep|conj|interj|art|num|abbr)\.\s*/i, '').trim();
}

function cleanText(s) {
    return s.replace(/[…...·.、，,；;]/g, '').replace(/\s+/g, '');
}

function charSetSim(a, b) {
    if (!a || !b) return 0;
    let sa = new Set(a), sb = new Set(b);
    let common = 0;
    for (let c of sa) { if (sb.has(c)) common++; }
    return (2 * common) / (sa.size + sb.size);
}

function levenshtein(a, b) {
    if (!a || !b) return 0;
    let matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            let cost = a[i-1] === b[j-1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i-1][j] + 1, matrix[i][j-1] + 1, matrix[i-1][j-1] + cost);
        }
    }
    let maxLen = Math.max(a.length, b.length);
    return 1 - (matrix[a.length][b.length] / maxLen);
}

function isReasonableExtension(answer, meaning) {
    const validExtensions = ['什么', '哪个', '哪些', '多少', '几', '一些', '任何', '所有', '各个', '每', '某', '其他', '另外'];
    const invalidSuffixes = ['的', '了', '着', '过', '地', '得'];
    for (let suffix of invalidSuffixes) {
        if (answer.endsWith(suffix)) {
            const withoutSuffix = answer.slice(0, -suffix.length);
            if (withoutSuffix === meaning) return false;
        }
    }
    for (let ext of validExtensions) {
        if (answer.includes(ext) && meaning.length > 0) {
            let temp = answer;
            for (let e of validExtensions) temp = temp.replace(e, '');
            if (temp.includes(meaning) || meaning.includes(temp)) return true;
        }
    }
    return false;
}

// 修复后的匹配函数 - 对于单字答案更加严格
function checkAnswer(answer, meaning) {
    const ans = answer.trim();
    if (!ans) return { correct: false, score: 0 };
    
    const cleanAns = cleanText(ans);
    
    // 先按分号分割词义，然后再清理每个词义
    const rawMeanings = meaning.split(/[;；]/);
    
    // 对于单字答案，必须完全匹配某个词义项或括号内的内容，或者是多词词义中的一个词
    if (cleanAns.length === 1) {
        for (let s of rawMeanings) {
            s = s.trim();
            if (!s) continue;
            
            // 先提取括号内容（在清理之前）
            const bracketMatch = s.match(/（([^）]+)）|\(([^)]+)\)/);
            if (bracketMatch) {
                const bracketContent = bracketMatch[1] || bracketMatch[2];
                if (bracketContent === cleanAns) {
                    return { correct: true, score: 1.0 };
                }
            }
            
            // 检查单字是否是多词词义中的一个词（如"朕，寡人"中的"朕"）
            // 在清理文本之前先提取，因为cleanText会去掉逗号
            let originalS = stripPosTag(s);
            let wordsPart = originalS.replace(/[（(][^）)]*[）)]/g, '').replace(/^\[[^\]]+\]/g, '').trim();
            const wordsInMeaning = wordsPart.split(/[，,、]/).map(w => w.trim()).filter(w => w);
            const cleanWords = wordsInMeaning.map(w => cleanText(w));
            if (cleanWords.includes(cleanAns)) {
                return { correct: true, score: 1.0 };
            }
            
            // 去除词性标签和清理文本
            let cleanedS = cleanText(originalS);
            
            // 检查单字是否完全等于某个词义项
            if (cleanedS === cleanAns) {
                return { correct: true, score: 1.0 };
            }
        }
        // 单字答案不匹配任何完整词义项
        return { correct: false, score: 0 };
    }
    
    // 对于两字及以上的答案，如果是常见的副词后缀且去掉后缀后太短，则不匹配
    // 注意："向前地"、"开着的"这样的词是有效的，因为后缀是词的一部分
    const invalidEndings = ['的', '了', '着', '过', '地', '得'];
    const lastChar = cleanAns.charAt(cleanAns.length - 1);
    if (invalidEndings.includes(lastChar) && cleanAns.length <= 2) {
        // 只有当答案很短（2字及以下）且以这些后缀结尾时才拒绝
        // 比如"的"、"了"这样的单字，或"好的"、"快了"这样的两字词
        return { correct: false, score: 0 };
    }
    
    // 对于多字答案，按分号分割词义
    const meanings = [];
    const meaningParts = meaning.split(/[;；]/);
    
    for (let s of meaningParts) {
        s = s.trim();
        if (!s) continue;
        s = stripPosTag(s);
        
        const bracketMatch = s.match(/（([^）]+)）|\(([^)]+)\)/);
        if (bracketMatch) meanings.push(bracketMatch[1] || bracketMatch[2]);
        
        const cleaned = s.replace(/[（(][^）)]*[）)]/g, '').trim();
        if (cleaned) meanings.push(cleaned);
    }
    
    const ansParts = cleanAns.split(/[;；,，、\n]/).map(s => s.trim()).filter(s => s);
    
    let bestScore = 0;
    let containMatch = false;
    
    for (let ap of ansParts) {
        for (let m of meanings) {
            if (!m) continue;
            
            if (ap === m) return { correct: true, score: 1.0 };
            
            const invalidSuffixes = ['的', '了', '着', '过', '地', '得'];
            const endsWithInvalidSuffix = invalidSuffixes.some(suffix => ap.endsWith(suffix));
            
            if (ap.length <= m.length) {
                // 对于2字及以下的答案，只要是词义的子串就能匹配（但单字已在前面处理）
                // 对于3字及以上的答案，需要匹配至少一半的长度
                const minMatchRatio = ap.length <= 2 ? 0.5 : 0.6;
                if (m.includes(ap) && !endsWithInvalidSuffix && ap.length / m.length >= minMatchRatio) {
                    containMatch = true;
                    bestScore = Math.max(bestScore, ap.length / m.length);
                    continue;
                }
                
                // 检查是否匹配逗号分隔的词义项中的某一项
                const commaParts = m.split(/[，,、]/).map(p => p.trim()).filter(p => p);
                for (let part of commaParts) {
                    if (part === ap) {
                        return { correct: true, score: 1.0 };
                    }
                    if (part.includes(ap) && !endsWithInvalidSuffix) {
                        containMatch = true;
                        bestScore = Math.max(bestScore, ap.length / part.length);
                        break;
                    }
                }
            } else {
                if (isReasonableExtension(ap, m)) {
                    containMatch = true;
                    bestScore = Math.max(bestScore, m.length / ap.length);
                    continue;
                }
                
                if (ap.includes(m)) {
                    const extra = ap.length - m.length;
                    if (extra <= 1 && !invalidSuffixes.includes(ap.charAt(ap.length - 1))) {
                        containMatch = true;
                        bestScore = Math.max(bestScore, m.length / ap.length);
                    } else if (isReasonableExtension(ap, m)) {
                        containMatch = true;
                        bestScore = Math.max(bestScore, m.length / ap.length);
                    }
                    continue;
                }
            }
            
            if (!endsWithInvalidSuffix) {
                bestScore = Math.max(bestScore, levenshtein(ap, m), charSetSim(ap, m));
                if (ap.length >= 2) {
                    for (let i = 0; i <= ap.length - 2; i++) {
                        if (m.includes(ap.substring(i, i + 2))) bestScore = Math.max(bestScore, 0.55);
                    }
                }
            }
        }
    }
    
    if (!containMatch) {
        const ansChars = new Set(cleanAns);
        for (let m of meanings) {
            if (!m) continue;
            const mChars = new Set(m);
            let common = 0;
            for (let c of ansChars) { if (mChars.has(c)) common++; }
            const charCoverage = common / mChars.size;
            const ansCoverage = common / ansChars.size;
            
            if (charCoverage >= 0.7 && ansCoverage >= 0.8) {
                containMatch = true;
                bestScore = Math.max(bestScore, (charCoverage + ansCoverage) / 2);
            }
        }
    }
    
    let threshold;
    if (cleanAns.length <= 1) {
        threshold = 0.9;
    } else if (cleanAns.length <= 2) {
        threshold = 0.5;  // 两字答案降低阈值，允许部分匹配
    } else {
        threshold = 0.55;
    }
    const correct = bestScore >= threshold || containMatch;
    
    return { correct, score: Math.min(Math.max(bestScore, 0), 1) };
}

console.log('=== 词义匹配测试 ===\n');
let passed = 0;
let failed = 0;

testCases.forEach((tc, index) => {
    const result = checkAnswer(tc.answer, tc.meaning);
    const expected = tc.shouldMatch;
    const actual = result.correct;
    const status = actual === expected ? '✓ PASS' : '✗ FAIL';
    
    if (actual === expected) {
        passed++;
    } else {
        failed++;
    }
    
    console.log(`${index + 1}. ${status}`);
    console.log(`   词义: "${tc.meaning}"`);
    console.log(`   答案: "${tc.answer}"`);
    console.log(`   期望: ${expected ? '匹配' : '不匹配'}, 实际: ${actual ? '匹配' : '不匹配'}, 分数: ${(result.score * 100).toFixed(1)}%`);
    console.log('');
});

console.log(`=== 测试结果: ${passed} 通过, ${failed} 失败 ===`);

console.log('\n=== 实际单词测试 ===');
const sampleWords = words.slice(0, 10);
sampleWords.forEach(word => {
    const testAnswers = [
        word.meaning.substring(0, 2),
        word.meaning.includes('；') ? word.meaning.split('；')[0] : word.meaning,
        '测试答案'
    ];
    
    console.log(`\n单词: ${word.word}`);
    console.log(`词义: ${word.meaning}`);
    testAnswers.forEach(ans => {
        const result = checkAnswer(ans, word.meaning);
        console.log(`  答案 "${ans}": ${result.correct ? '匹配' : '不匹配'} (${(result.score * 100).toFixed(1)}%)`);
    });
});

console.log('=== 单字答案匹配测试 ===');
console.log('单词: before');
console.log('词义: prep. 在…之前；conj. 在…以前；adv. 以前，过去');
console.log('');

const testAnswers = ['在之前', '之前', '前', '先', '于', '过', '在', '以前'];
testAnswers.forEach(ans => {
    const result = checkAnswer(ans, 'prep. 在…之前；conj. 在…以前；adv. 以前，过去');
    console.log('答案 "' + ans + '": ' + (result.correct ? '✅ 正确' : '❌ 错误') + ' (' + (result.score * 100).toFixed(1) + '%)');
});

console.log('');
console.log('=== 其他单词测试 ===');
console.log('单词: we');
console.log('词义: pron. 我们（主格）；[古]朕，寡人；笔者，本人（作者或演讲人使用）');
console.log('');

['我们', '朕', '寡', '人', '笔', '者', '本', '主格'].forEach(ans => {
    const result = checkAnswer(ans, 'pron. 我们（主格）；[古]朕，寡人；笔者，本人（作者或演讲人使用）');
    console.log('答案 "' + ans + '": ' + (result.correct ? '✅ 正确' : '❌ 错误') + ' (' + (result.score * 100).toFixed(1) + '%)');
});
console.log('');
console.log('=== 多义词测试 (on) ===');
console.log('单词: on');
console.log('词义: 向前地；继续着；作用中，行动中;adj.开着的，接通的;prep.在…上');
console.log('');

['向前地', '开着的', '继续着', '作用中', '行动中', '接通的', '在…上'].forEach(ans => {
    const result = checkAnswer(ans, '向前地；继续着；作用中，行动中;adj.开着的，接通的;prep.在…上');
    console.log('答案 "' + ans + '": ' + (result.correct ? '✅ 正确' : '❌ 错误') + ' (' + (result.score * 100).toFixed(1) + '%)');
});
console.log('--------------------------------------');
var ans = '某一';
var result = checkAnswer(ans, 'adj. 一些；大约；某一');
console.log('答案 "' + ans + '": ' + (result.correct ? '✅ 正确' : '❌ 错误') + ' (' + (result.score * 100).toFixed(1) + '%)');
//node test_single_char.js