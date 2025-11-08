import { customBadWordList } from "./bad_word_list";

/**
 * @param {string} message
 * @returns {string}
 */
export function filterBadWords(message) {
  const badWords = customBadWordList.createWordArray(); // Sum of basic bad words and additional bad words
  const filteredBadWords = [...new Set(badWords)].filter(
    (word) => word.length > 0
  );

  if (filteredBadWords.length === 0) {
    // if bad word is blank, do nothing.
    return message;
  }

  let cleaned = "";
  const mapToOriginal = []; // List for remembering what kind of, where was a blank / number / special character

  for (let i = 0; i < message.length; i++) {
    const ch = message[i];
    if (/\p{L}/u.test(ch)) {
      mapToOriginal.push(i); // Push contents to mapToOriginal except for blank / number / special character
      cleaned += ch.toLowerCase();
    }
  }

  const pattern = new RegExp(filteredBadWords.join("|"), "gi"); // Detect bad words
  const matches = [...cleaned.matchAll(pattern)];
  const result = message.split("");

  for (const m of matches) {
    const start = m.index;
    const end = start + m[0].length;
    for (let i = start; i < end; i++) {
      const origIndex = mapToOriginal[i];
      result[origIndex] = "*";
      // Only replace bad words to * except for blank / number / special character
    }
  }

  return result.join("");
}
