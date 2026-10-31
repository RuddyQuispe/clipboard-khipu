import { describe, test, assertEqual } from './harness.js';
import { detectTextType } from '../src/typeDetect.js';

describe('detectTextType', () => {
    test('empty and whitespace-only text is plain', () => {
        assertEqual(detectTextType(''), 'plain');
        assertEqual(detectTextType('  \n\t '), 'plain');
    });

    test('a single-line URL is a url', () => {
        assertEqual(detectTextType('https://github.com/RuddyQuispe/clipboard-khipu'), 'url');
        assertEqual(detectTextType('  ftp://example.org/file  '), 'url');
    });

    test('a URL inside a sentence is not a url', () => {
        assertEqual(detectTextType('see https://example.org for details'), 'plain');
    });

    test('absolute, home and relative paths are paths', () => {
        assertEqual(detectTextType('/usr/share/backgrounds'), 'path');
        assertEqual(detectTextType('~/dev/personal'), 'path');
        assertEqual(detectTextType('./src/paster.ts'), 'path');
        assertEqual(detectTextType('../README.md'), 'path');
    });

    test('valid JSON objects and arrays are json', () => {
        assertEqual(detectTextType('{"a": 1, "b": [true, null]}'), 'json');
        assertEqual(detectTextType('[\n  1,\n  2\n]'), 'json');
    });

    test('brace-wrapped text that does not parse is not json', () => {
        assertEqual(detectTextType('{ not: json }'), 'plain');
        assertEqual(detectTextType('{\n  not: json;\n}'), 'code');
    });

    test('a document marker or mostly key/value lines is yaml', () => {
        assertEqual(detectTextType('---\nfoo'), 'yaml');
        assertEqual(detectTextType('services:\n  web:\n    image: nginx\n    ports:\n      - "80:80"'), 'yaml');
    });

    test('a single key/value line is not yaml', () => {
        assertEqual(detectTextType('key: value'), 'plain');
    });

    test('multi-line text with code hints is code', () => {
        assertEqual(detectTextType('const a = 1;\nconsole.log(a);'), 'code');
        assertEqual(detectTextType('def f():\n    return 1'), 'code');
    });

    test('single-line code-looking text stays plain', () => {
        assertEqual(detectTextType('const a = 1;'), 'plain');
    });

    test('prose is plain', () => {
        assertEqual(detectTextType('Just a sentence.\nAnd another one.'), 'plain');
    });
});
