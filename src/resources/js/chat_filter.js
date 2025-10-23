/**
 * @param {string} message
 * @returns {string}
 */
export function filterBadWords(message) {
  message = message.replace(/[^ㄱ-ㅎ가-힣ㅏ-ㅣa-zA-Z]/g, ''); // Returns a string after removing spaces and special characters.
  
  const badWords = [
    'fuck', 'fuckyou', 'shit', 'bitch', 'asshole', 'nigger', 'faggot',
    '개새', '느금', 'ㄴㄱㅁ', 'ㄴ금마', '니애미', 'ㄴㅇㅁ', '느그',
    '병신', '병ㅅ', 'ㅂㅅ', 'ㅂ신', 'ㅅㅂ', '새끼', 'ㅅㄲ', '시발', '씨발', 'ㅅ발', '애미', '애비',
    '어머니', '엄마', '아버지', '좆', 'ㅈ까',
    'ㅈ밥', 'ㅈㅂ', 'ㅈ이', 'ㅄ', '씹', 'ㅗㅗ'
  ]; // list of bad words

  const pattern = new RegExp(badWords.join('|'), 'gi'); // Search if a word contains bad words

  return message.replace(pattern, (match) => {
    return '*'.repeat(match.length);
  }); // Replace bad words to *
}
