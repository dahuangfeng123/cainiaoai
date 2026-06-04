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
            matrix[i][j] = Math.min(
                matrix[i-1][j] + 1,
                matrix[i][j-1] + 1,
                matrix[i-1][j-1] + cost
            );
        }
    }
    let maxLen = Math.max(a.length, b.length);
    return 1 - (matrix[a.length][b.length] / maxLen);
}

// 检查答案是否合理扩展了词义
function isReasonableExtension(answer, meaning) {
    // 常见的合理扩展词（疑问词、量词等）
    const validExtensions = ['什么', '哪个', '哪些', '多少', '几', '一些', '任何', '所有', '各个', '每', '某', '其他', '另外'];
    
    // 常见的不合理后缀（会改变词性）
    const invalidSuffixes = ['的', '了', '着', '过', '地', '得'];
    
    // 检查是否以不合理后缀结尾
    for (let suffix of invalidSuffixes) {
        if (answer.endsWith(suffix)) {
            const withoutSuffix = answer.slice(0, -suffix.length);
            // 如果去掉后缀后正好等于词义，则不匹配
            if (withoutSuffix === meaning) {
                return false;
            }
        }
    }
    
    // 检查是否包含合理扩展
    for (let ext of validExtensions) {
        if (answer.includes(ext) && meaning.length > 0) {
            // 移除扩展词后检查是否仍然包含词义
            let temp = answer;
            for (let e of validExtensions) {
                temp = temp.replace(e, '');
            }
            if (temp.includes(meaning) || meaning.includes(temp)) {
                return true;
            }
        }
    }
    
    return false;
}

function checkAnswer(answer, meaning) {
    const ans = answer.trim();
    if (!ans) return { correct: false, score: 0 };
    
    // 清理答案和词义
    const cleanAns = cleanText(ans);
    const cleanMeaning = cleanText(meaning);
    
    const rawMeanings = cleanMeaning.split(/[;；,，、\n]/);
    const meanings = [];
    
    for (let s of rawMeanings) {
        s = s.trim();
        if (!s) continue;
        s = stripPosTag(s);
        
        const bracketMatch = s.match(/（([^）]+)）|\(([^)]+)\)/);
        if (bracketMatch) {
            meanings.push(bracketMatch[1] || bracketMatch[2]);
        }
        
        const cleaned = s.replace(/[（(][^）)]*[）)]/g, '').trim();
        if (cleaned) {
            meanings.push(cleaned);
        }
    }
    
    const ansParts = cleanAns.split(/[;；,，、\n]/).map(s => s.trim()).filter(s => s);
    
    let bestScore = 0;
    let containMatch = false;
    
    for (let ap of ansParts) {
        for (let m of meanings) {
            if (!m) continue;
            
            if (ap === m) {
                return { correct: true, score: 1.0 };
            }
            
            // 答案比词义短或相等，检查词义是否包含答案
            if (ap.length <= m.length) {
                // 检查答案是否以无效后缀结尾（如"的"）
                const invalidSuffixes = ['的', '了', '着', '过', '地', '得'];
                const endsWithInvalidSuffix = invalidSuffixes.some(suffix => ap.endsWith(suffix));
                
                if (m.includes(ap) && !endsWithInvalidSuffix) {
                    containMatch = true;
                    bestScore = Math.max(bestScore, ap.length / m.length);
                    continue;
                }
            } else {
                // 答案比词义长
                // 检查是否是合理扩展
                if (isReasonableExtension(ap, m)) {
                    containMatch = true;
                    bestScore = Math.max(bestScore, m.length / ap.length);
                    continue;
                }
                
                // 检查清理后的答案是否完全包含清理后的词义
                // 但如果只是加了"的"等后缀，则不匹配
                if (ap.includes(m)) {
                    // 检查是否只是加了单个字符后缀
                    const extra = ap.length - m.length;
                    if (extra <= 1) {
                        // 如果只多一个字符，检查是否是无效后缀
                        const lastChar = ap.charAt(ap.length - 1);
                        const invalidSuffixes = ['的', '了', '着', '过', '地', '得'];
                        if (invalidSuffixes.includes(lastChar)) {
                            // 加了无效后缀，不匹配
                            continue;
                        }
                        // 允许其他情况
                        containMatch = true;
                        bestScore = Math.max(bestScore, m.length / ap.length);
                    } else if (ap.includes(m)) {
                        // 答案包含词义，且扩展比较大，检查是否合理
                        if (isReasonableExtension(ap, m)) {
                            containMatch = true;
                            bestScore = Math.max(bestScore, m.length / ap.length);
                        }
                    }
                    continue;
                }
            }
            
            // 检查答案是否以无效后缀结尾（如"的"），如果是则跳过相似度计算
            const invalidSuffixes = ['的', '了', '着', '过', '地', '得'];
            const endsWithInvalidSuffix = invalidSuffixes.some(suffix => ap.endsWith(suffix));
            
            if (!endsWithInvalidSuffix) {
                // 编辑距离相似度
                let edSim = levenshtein(ap, m);
                bestScore = Math.max(bestScore, edSim);
                
                // 字符集相似度
                let csSim = charSetSim(ap, m);
                bestScore = Math.max(bestScore, csSim);
                
                // 子串匹配（连续2个以上字符）
                if (ap.length >= 2) {
                    for (let i = 0; i <= ap.length - 2; i++) {
                        let sub = ap.substring(i, i + 2);
                        if (m.includes(sub)) {
                            bestScore = Math.max(bestScore, 0.55);
                        }
                    }
                }
            }
        }
    }
    
    // 字符级别覆盖检查（仅当没有找到包含匹配时）
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
        threshold = 0.7;
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