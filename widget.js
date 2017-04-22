'use strict';
const fs = require('fs');
const blessed = require('blessed');
const request = require('request');
const Promise = require('bluebird');
const _definitionPatterns = require('./definition-patterns');

const wordnikApiKey = process.env.WORDNIK_API_KEY;
if (!wordnikApiKey) {
    console.log("Requires a Wordnik API Key to be set to $WORDNIK_API_KEY. You can obtain a key from: http://developer.wordnik.com/");
    console.log("Exiting...");
    process.exit(0);
}
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

function getWordOrRandom(word) {
    return new Promise((resolve, reject) => {
        if (word) {
            return resolve(word);
        }
        requestPromise({
            uri: `https://api.wordnik.com/v4/words.json/randomWord?hasDictionaryDef=true&api_key=${wordnikApiKey}`,
            json: true,
        }).then((response) => {
            resolve(response.body.word);
        });
    });
}

function getSingularRootForm(word, definitions) {
    let pluralDefinition = "Plural form of ";
    let seeAlsoRegex = /$See ([\w\s]+)(\.|,)/;
    let singularWord = word;
    if (definitions[0].text && definitions[0].text.startsWith(pluralDefinition)) {
        singularWord = definitions[0].text.replace(pluralDefinition, '');
        singularWord = singularWord.split(' ')[0].replace('.', '');
    } else if (definitions[0].text && definitions[0].text.match(seeAlsoRegex)) {
        singularWord = definitions[0].text.match(seeAlsoRegex)[1];
    }
    return singularWord;
}

function storeDefinitions(definitions) {
    for (let def of definitions) {
        if (def.text) {
            _definitionPatterns.push(def.text);
        }
    }
    fs.writeFile('./definition-patterns.json', JSON.stringify(_definitionPatterns, null, 2));
}

function getRandomDefinition(attempts, word) {
    return new Promise((resolve, reject) => {
        attempts = attempts || 0;
        getWordOrRandom().then((resolvedWord) => {
            word = resolvedWord;
            attempts++;
            return requestPromise({
                uri: `https://api.wordnik.com/v4/word.json/${word}/definitions?sourceDictionaries=ahd%2Cwiktionary%2Cwebster%2Cwordnet&useCanonical=true&api_key=${wordnikApiKey}`,
                json: true,
            });
        }).then((response) => {
            let definitions = response.body;
            if (definitions.length < 1) {
                getRandomDefinition(attempts).then((result) => {
                    resolve(result);
                });
            } else if (getSingularRootForm(word, definitions) != word) {
                getRandomDefinition(attempts, getSingularRootForm(word, definitions)).then((result) => {
                    resolve(result);
                });
            } else {
                resolve({
                    word: word,
                    definitions: definitions,
                    attempts: attempts,
                });
                // storeDefinitions(definitions);
            }
        });
    });
}

function renderDefinitionContent(word, definitions) {
    let output = `{bold}${word}{/bold}\n`;
    for (let def of definitions) {
        let i = definitions.indexOf(def);
        if (def.text) {
            var subjectRegex = /^([\w\s]+)\s\s/i;
            var subject = '';
            if (def.text.match(subjectRegex)) {
                subject = def.text.match(subjectRegex)[1].trim();
            }
            def.text = def.text.replace(subject, '').trim();

            output += `{#666-fg}${i+1}.`;
            if (def.partOfSpeech) {
                output += ` {bold}[${def.partOfSpeech.replace('-', ', ')}]{/bold} -`;
            }
            if (subject) {
                output += ` (${subject})`;
            }
            output += `{/} ${def.text}\n`;
        }
        // output += `\n{#666-fg}   ${JSON.stringify(def)}{/}\n\n`;
    }
    return output;
}

function startLoading() {
    _refreshing = true;
    marqueeBox.setContent(' Loading word...');
    screen.render();
}

function stopLoading() {
    _refreshing = false;
    marqueeBox.setContent('');
    screen.render();
}

function newRandomWord() {
    startLoading();
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
    stopLoading();
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
    height: '100%-2',
});

let wordsList = blessed.list({
    top: '0%',
    left: '70%',
    width: '30%',
    height: '100%',
    label: ' 📄  Words ',
    mouse: true,
    keys: true,
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

let controlsBox = blessed.box({
    top: '100%-1',
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

let marqueeBox = blessed.box({
    top: '100%-2',
    left: 'center',
    width: '100%',
    height: 1,
    content: '',
    tags: 'true',
    style: {
        fg: 'white',
        bg: 'black',
    },
});

// Append our box to the screen
screen.append(mainBox);
screen.append(marqueeBox);
screen.append(controlsBox);

// Quit on Escape, q, or Control-C.
screen.key(['escape', 'q', 'C-c'], (ch, key) => {
    return process.exit(0);
});

// Get a new word on r
screen.key(['r'], (ch, key) => {
    if (!_refreshing) {
        newRandomWord();
    }
});

// Prepare for first render
wordsList.focus();

// Render the screen.
screen.render();

newRandomWord();

setInterval(() => {
    if (!_refreshing) {
        newRandomWord();
    }
}, 1 * 60 * 1000);  // every one minute
