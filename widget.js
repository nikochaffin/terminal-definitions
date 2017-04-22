'use strict';
const blessed = require('blessed');
const request = require('request');
const Promise = require('bluebird');

const wordnikApiKey = 'd7aaca0a11670730890060f438d02ed0d5b81b26605407d99';
let _refreshing = false;
let _words = {};
let _cache = [];

function breakCircularJSON(key, value) {
    if (typeof value === 'object' && value !== null) {
        if (_cache.indexOf(value) !== -1) {
            // Circular reference found, discard key
            return;
        }
        // Store value in our collection
        _cache.push(value);
    }
    return value;
}

function circularJSONstringify(obj) {
    let output = JSON.stringify(obj, breakCircularJSON);
    _cache = [];
    return output;
}

function requestPromise(options) {
    return new Promise((resolve, reject) => {
        request(options, (error, response, body) => {
            if (error) {
                reject(error);
            }
            resolve({response: response, body: body});
        });
    })
}

function getRandomWord() {
    return requestPromise({
        uri: `https://api.wordnik.com/v4/words.json/randomWord?hasDictionaryDef=true&api_key=${wordnikApiKey}`,
        json: true,
    });
}

function getRandomDefinition(attempts) {
    return new Promise((resolve, reject) => {
        attempts = attempts || 0;
        getRandomWord().then((response) => {
            let word = response.body.word;
            attempts++;
            requestPromise({
                uri: `https://api.wordnik.com/v4/word.json/${word}/definitions?sourceDictionaries=ahd%2Cwiktionary%2Cwebster%2Cwordnet&useCanonical=true&api_key=${wordnikApiKey}`,
                json: true,
            }).then((response) => {
                if (response.body.length >= 1) {
                    resolve({
                        word: word,
                        definitions: response.body,
                        attempts: attempts,
                    });
                } else {
                    getRandomDefinition(attempts).then((result) => {
                        resolve(result);
                    });
                }
            });
        });
    });
}

function renderDefinitionContent(word, definitions) {
    let output = `{bold}${word}{/bold}\n`;
    for (let def of definitions) {
        let i = definitions.indexOf(def);
        output += `{#666-fg}${i+1}. [${def.partOfSpeech}] -{/} ${def.text}\n`;
    }
    return output;
}

function newRandomWord() {
    _refreshing = true;
    getRandomDefinition().then((result) => {
        let word = result.word,
            definitions = result.definitions;
        setWord(word, definitions);
    });
}

function setWord(word, definitions) {
    let content = renderDefinitionContent(word, definitions);
    definitionBox.setContent('');
    definitionBox.pushLine(content);
    definitionBox.setScrollPerc(0);
    if (!(word in _words)) {
        wordsList.add(word);
        _words[word] = definitions;
    }
    wordsList.select(wordsList.getItemIndex(word));
    _refreshing = false;
    screen.title = `Definitions: ${word}`;
    screen.render();
}

// Create a screen object
const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
});

screen.title = "Defintions";

// Create a box perfectly centered horizontally and vertically
let mainBox = blessed.box({
    top: '0%',
    left: 'center',
    width: '100%',
    height: '99%',
});

let wordsList = blessed.list({
    top: '0%',
    left: '70%',
    width: '30%',
    height: '100%',
    label: ' 📄  Words ',
    mouse: true,
    scrollable: true,
    items: [],
    border: {
        type: 'line',
    },
    style: {
        item: {
            fg: 'white',
        },
        selected: {
            fg: 'white',
            inverse: true,
        },
    }
});
wordsList.on('select', (e) => {
    let word = Object.keys(_words)[wordsList.selected];
    let definitions = _words[word];
    setWord(word, definitions);
    screen.render();
});
mainBox.append(wordsList);

let definitionBox = blessed.box({
    top: '0%',
    left: '0%',
    width: '70%',
    height: '100%',
    padding: 1,
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    tags: true,
    style: {
        fg: 'white',
    }
});
mainBox.append(definitionBox);

let banner = blessed.box({
    top: '99%',
    left: 'center',
    width: '100%',
    height: 1,
    content: ' [{bold}Esc/Q{/bold}] Quit  [{bold}R{/bold}] Refresh',
    tags: true,
    style: {
        fg: 'white',
        inverse: true,
    }
});

// Append our box to the screen
screen.append(mainBox);
screen.append(banner);

// Quit on Escape, q, or Control-C.
screen.key(['escape', 'q', 'C-c'], (ch, key) => {
  return process.exit(0);
});

// Get a new word on r
screen.key(['r'], (ch, key) => {
  newRandomWord();
});

// Prepare for first render
mainBox.focus();

// Render the screen.
screen.render();

newRandomWord();

setInterval(() => {
    if (!_refreshing) {
        newRandomWord();
    }
}, 1 * 60 * 1000);
