import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { Declaration, Node } from 'php-parser';
import { PHPUnitXML } from '../PHPUnitXML';
import { engine } from '../utils';
import { PestParser } from './PestParser';
import { PHPUnitParser } from './PHPUnitParser';
import { TestDefinition, TestType } from './types';

const textDecoder = new TextDecoder('utf-8');

export const generateQualifiedClass = (namespace?: string, clazz?: string) => [namespace, clazz].filter((name) => !!name).join('\\');

export const generateUniqueId = (namespace?: string, clazz?: string, method?: string) => {
    if (!clazz) {
        return namespace;
    }

    let uniqueId = generateQualifiedClass(namespace, clazz);
    if (method) {
        uniqueId = `${uniqueId}::${method}`;
    }

    return uniqueId;
};

export class TestParser {
    private parsers = [new PHPUnitParser(), new PestParser()];
    private eventEmitter = new EventEmitter;

    constructor(private phpUnitXML?: PHPUnitXML) {}

    on(eventName: TestType, callback: (testDefinition: TestDefinition, index?: number) => void) {
        this.eventEmitter.on(`${eventName}`, callback);
    }

    async parseFile(file: string) {
        return this.parse(textDecoder.decode(await readFile(file)), file);
    }

    parse(text: Buffer | string, file: string) {
        text = text.toString();

        // Todo https://github.com/glayzzle/php-parser/issues/170
        text = text.replace(/\?>\r?\n<\?/g, '?>\n___PSEUDO_INLINE_PLACEHOLDER___<?');

        try {
            const ast = engine.parseCode(text, file);

            // https://github.com/glayzzle/php-parser/issues/155
            // currently inline comments include the line break at the end, we need to
            // strip those out and update the end location for each comment manually
            ast.comments?.forEach((comment) => {
                if (comment.value[comment.value.length - 1] === '\r') {
                    comment.value = comment.value.slice(0, -1);
                    comment.loc!.end.offset = comment.loc!.end.offset - 1;
                }
                if (comment.value[comment.value.length - 1] === '\n') {
                    comment.value = comment.value.slice(0, -1);
                    comment.loc!.end.offset = comment.loc!.end.offset - 1;
                }
            });

            return this.parseAst(ast, file);
        } catch (e) {
            return undefined;
        }
    }

    private parseAst(declaration: Declaration | Node, file: string): TestDefinition[] | undefined {
        for (const parser of this.parsers) {
            parser.setRoot(this.phpUnitXML?.root() ?? '');
            const tests = parser.parse(declaration, file);
            if (tests) {
                return this.emit(tests);
            }
        }

        return;
    }

    private emit(tests: TestDefinition[]) {
        tests.forEach(test => {
            this.eventEmitter.emit(`${test.type}`, test);
            if (test.children && test.children.length > 0) {
                this.emit(test.children);
            }
        });

        return tests;
    }
}
