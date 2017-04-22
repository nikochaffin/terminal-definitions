'use strict';
const fs = require('fs');
const _definitionPatterns = require('./definition-patterns');

const analyzedDefinitions = [];
const wordCounts = {};
const substringCounts = {};
const wordPositions = [];
const rankedCounts = [];
const MIN_COUNT = 1;

function cleanWord(word) {
    word = word.toLowerCase().replace(/(\s|[^\w\'\-])/, '');
    word = word.replace(/^\'/, '');
    return word;
}

function processWordCount(word) {
    if (!(word in wordCounts)) {
        wordCounts[word] = 0;
    }
    wordCounts[word] += 1;
}

function processSubstringCount(substring) {
    if (!(substring in substringCounts)) {
        substringCounts[substring] = 0;
    }
    substringCounts[word] += 1;
}

for (let def of _definitionPatterns) {
    let words = def.split(' ');
    // TODO: analyze/process substrings
    // let substrings = getSubstrings(def);

    for (var i=0; i<words.length; i++) {
        let word = words[i];

        word = cleanWord(word);
        if (!word) {
            break;
        }
        processWordCount(word);
    }
}

function getSubstrings(sentence) {
    let substrings = [];
    let words = sentence.split(' ');
    for (var i=0; i<words.length; i++) {
        substrings.push(words[i]);
        if (i !== 0) {
            substrings.push(words.slice(0, i+1).join(' '));
        }
        if (i + 1 !== words.length) {
            substrings.push(words.slice(i).join(' '));
        }
    }
    let uniqueSubstrings = substrings.filter((val, i, arr) => arr.indexOf(val) === i);
    return uniqueSubstrings;
}

for (let word in wordCounts) {
    let count = wordCounts[word];
    let countObj = {
        word: word,
        count: count
    };
    if (count >= MIN_COUNT) {
        rankedCounts.push(countObj);
    }
}

rankedCounts.sort((a, b) => {
    if (a.count < b.count) {
        return -1;
    }
    if (a.count > b.count) {
        return 1;
    }
    if (a.count == b.count) {
        if (a.word < b.word) {
            return -1;
        }
        if (a.word > b.word) {
            return 1;
        }
        return 0;
    }
    return 0;
});

fs.writeFile('./word-counts.json', JSON.stringify(rankedCounts.reverse(), null, 2));
