/**
 * @param {string} message
 * @returns {string}
 */
export function filterBadWords(message) {
  const badWords = [
    'fuck', 'fuckyou', 'shit', 'bitch', 'asshole', 'nigger', 'faggot',
    '개새', '느금', 'ㄴㄱㅁ', 'ㄴ금마', '니애미', 'ㄴㅇㅁ', '느그',
    '병신', '병ㅅ', 'ㅂㅅ', 'ㅂ신', 'ㅅㅂ', '새끼', 'ㅅㄲ', '시발', '씨발', 'ㅅ발',
    '애미', '애비', '어머니', '엄마', '아버지', '좆', 'ㅈ까', 'ㅈ밥', 'ㅈㅂ', 'ㅈ이', 'ㅄ', '씹', 'ㅗㅗ'
  ];

  let cleaned = '';
  const mapToOriginal = []; // List for remembering what kind of, where was a blank / number / special character

  for (let i = 0; i < message.length; i++) {
    const ch = message[i];
    if (/[ㄱ-ㅎ가-힣a-zA-Z]/.test(ch)) {
      mapToOriginal.push(i); // Push contents to mapToOriginal except for blank / number / special character
      cleaned += ch;
    }
  }

  const pattern = new RegExp(badWords.join('|'), 'gi'); // Detect bad words
  const matches = [...cleaned.matchAll(pattern)];
  const result = message.split('');

  for (const m of matches) {
    const start = m.index;
    const end = start + m[0].length;
    for (let i = start; i < end; i++) {
      const origIndex = mapToOriginal[i]; 
      if (origIndex !== undefined) result[origIndex] = '*'; // Only replace bad words to * except for blank / number / special character
    }
  }

  return result.join('');
}


