import { getIfLocalStorageIsAvailable } from '../utils/is_local_storage_available';
const STORAGE_KEY_CUSTOM_LIST = 'stringifiedCustomBadWordListArrayView';
const isLocalStorageAvailable = getIfLocalStorageIsAvailable();

/**
 * Class representing a custom bad word added by the user.
 */
class CustomBadWord {
  /**
   * Create a CustomBadWord object
   * @param {string} word
   * @param {number} [addedTime]
   */
  constructor(word, addedTime = Date.now()) {
    this.word = word.toLowerCase().trim();
    this.addedTime = addedTime;
  }
}

/**
 * Class representing a list of custom bad words
 */
class CustomBadWordList {
  /**
   * Create a CustomBadWordList object
   * @param {number} maxLength
   */
  constructor(maxLength) {
    this._badWords = [];
    this.maxLength = maxLength;
    this.loadFromLocalStorage();
  }

  /**
   * [신규] ui.js에서 로딩 로직을 가져옵니다.
   */
  loadFromLocalStorage() {
    if (!isLocalStorageAvailable) {
      return; // 로컬 스토리지 사용 불가 시 중지
    }

    let stringifiedList = null;
    try {
      stringifiedList = window.localStorage.getItem(STORAGE_KEY_CUSTOM_LIST);
    } catch (err) {
      console.log(err);
    }

    if (stringifiedList !== null) {
      const arrayView = JSON.parse(stringifiedList);
      // 스키마 검증
      if (arrayView.length > 0 && arrayView[0].length !== 2) {
        window.localStorage.removeItem(STORAGE_KEY_CUSTOM_LIST);
        // location.reload(); // 여기서 reload를 호출하면 무한 루프에 빠질 수 있으니 제거.
      } else {
        this.readArrayViewAndUpdate(arrayView); // 리스트 채우기
      }
    }
  }

  /**
   * [신규] ui.js에서 저장 로직을 가져옵니다.
   */
  saveToLocalStorage() {
    if (!isLocalStorageAvailable) {
      return;
    }
    try {
      window.localStorage.setItem(
        STORAGE_KEY_CUSTOM_LIST,
        JSON.stringify(this.createArrayView())
      );
    } catch (err) {
      console.log(err);
    }
  }

  get length() {
    return this._badWords.length;
  }

  /**
   * @returns {boolean}
   */
  isFull() {
    return this.length >= this.maxLength;
  }

  /**
   * Add a new custom bad word to the list.
   * Silently fails if the word is empty, list is full, or word already exists.
   * @param {string} word
   * @returns {boolean} Returns true if added successfully, false otherwise.
   */
  add(word) {
    const cleanWord = word.toLowerCase().trim();
    if (!cleanWord || this.isFull()) {
      return false;
    }
    
    if (this._badWords.some((bw) => bw.word === cleanWord)) {
      return false; // Duplicate Check, if already exists, do nothing.
    }
    this._badWords.push(new CustomBadWord(cleanWord, Date.now()));
    this.saveToLocalStorage();
    return true;
  }

  /**
   * Remove a custom bad word at index from the list
   * @param {number} index
   */
  removeAt(index) {
    this._badWords.splice(index, 1);
    this.saveToLocalStorage();
  }

  /**
   * Create a read-only 2D array [word, addedTime, remark].
   * @returns {[string, number][]}
   */
  createArrayView() {
    return this._badWords.map((badWord) => [
      badWord.word,
      badWord.addedTime,
    ]);
  }

  /**
   * Read a 2D array and update this._badWords from it.
   * @param {[string, number, string][]} arrayView
   */
  readArrayViewAndUpdate(arrayView) {
    this._badWords = []; 
    arrayView.slice(0, this.maxLength);
    this._badWords = arrayView.map(
      (value) => new CustomBadWord(value[0], value[1])
    );
  }

  /**
   * Create a read-only 1D array of words.
   * @returns {string[]}
   */
  createWordArray() {
    return this._badWords.map((badWord) => badWord.word);
  }
}

export const customBadWordList = new CustomBadWordList(50); // Limit of the number of bad words
