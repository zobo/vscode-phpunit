import 'jest';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { OutputChannel, TestRunRequest } from 'vscode';
import { Configuration, EOL, LocalCommand, TestRunner } from '../PHPUnit';
import { getPhpUnitVersion, phpUnitProject } from '../PHPUnit/__tests__/utils';
import { OutputChannelObserver } from './OutputChannelObserver';

describe('OutputChannelObserver', () => {
    const PHPUNIT_VERSION: string = getPhpUnitVersion();

    function getOutputChannel(): OutputChannel {
        return (vscode.window.createOutputChannel as jest.Mock).mock.results[0].value;
    }

    function debug(outputChannel: OutputChannel) {
        console.log((outputChannel.appendLine as jest.Mock).mock.calls);
        console.log((outputChannel.append as jest.Mock).mock.calls);
    }

    async function run(
        file?: string,
        filter?: string,
        config: { [p: string]: string | string[] | boolean } = {},
    ) {
        const configuration = new Configuration({
            php: 'php',
            phpunit: 'vendor/bin/phpunit',
            args: ['-c', 'phpunit.xml'],
            clearOutputOnRun: true,
            showAfterExecution: 'onFailure',
            ...config,
        });

        if (filter) {
            filter = `--filter="^.*::(${filter})( with data set .*)?$"`;
        }

        const outputChannel = vscode.window.createOutputChannel('phpunit');
        const observer = new OutputChannelObserver(outputChannel, configuration, {
            continuous: false,
        } as TestRunRequest);

        const cwd = phpUnitProject('');
        const command = new LocalCommand(configuration, { cwd });
        command.setArguments([file, filter].join(' '));

        const testRunner = new TestRunner();
        testRunner.observe(observer);

        await testRunner.run(command);
    }

    it('should trigger input', async () => {
        const testFile = phpUnitProject('tests/AssertionsTest.php');
        await run(testFile);
        const outputChannel = getOutputChannel();
        expect(outputChannel.clear).toHaveBeenCalled();
        expect(outputChannel.appendLine).toHaveBeenCalledWith(
            `php vendor/bin/phpunit --configuration=phpunit.xml ${testFile} --colors=never --teamcity`,
        );
    });

    it('should trigger testVersion', async () => {
        if (semver.lt(PHPUNIT_VERSION, '10.0.0')) {
            return;
        }

        const testFile = phpUnitProject('tests/AssertionsTest.php');
        await run(testFile);

        const outputChannel = getOutputChannel();
        expect(outputChannel.appendLine).toHaveBeenCalledWith(
            expect.stringMatching(/PHPUnit\s[\d.]+/),
        );
    });

    // it('should trigger testRuntime', async () => {
    //     if (phpUnitVersion >= 9) {
    //         return;
    //     }
    //
    //     const testFile = phpUnitProject('tests/AssertionsTest.php');
    //     await run(testFile);
    //
    //     const outputChannel = getOutputChannel();
    //     expect(outputChannel.appendLine).toHaveBeenCalledWith(
    //         expect.stringMatching(/Runtime:\s+PHP\s[\d.]+/)
    //     );
    // });

    // it('should trigger testConfiguration', async () => {
    //     if (phpUnitVersion >= 9) {
    //         return;
    //     }
    //
    //     const testFile = phpUnitProject('tests/AssertionsTest.php');
    //     await run(testFile);
    //
    //     const outputChannel = getOutputChannel();
    //     expect(outputChannel.appendLine).toHaveBeenCalledWith(
    //         expect.stringMatching(/Configuration:.+/)
    //     );
    // });

    it('should trigger testSuiteStarted', async () => {
        const testFile = phpUnitProject('tests/AssertionsTest.php');
        const filter = 'test_passed';
        await run(testFile, filter);

        const outputChannel = getOutputChannel();
        expect(outputChannel.appendLine).not.toHaveBeenCalledWith(
            'Recca0120\\\\VSCode\\\\Tests\\\\AssertionsTest::test_passed',
        );
    });

    it('should trigger testSuiteStarted without method', async () => {
        const testFile = phpUnitProject('tests/AssertionsTest.php');
        const filter = 'addition_provider|test_passed';
        await run(testFile, filter);

        const outputChannel = getOutputChannel();
        expect(outputChannel.appendLine).not.toHaveBeenCalledWith(
            'Recca0120\\\\VSCode\\\\Tests\\\\AssertionsTest::addition_provider',
        );
    });

    it('should trigger testFinished', async () => {
        const testFile = phpUnitProject('tests/AssertionsTest.php');
        const filter = 'test_passed';
        await run(testFile, filter);

        const outputChannel = getOutputChannel();
        expect(outputChannel.appendLine).toHaveBeenCalledWith(
            expect.stringMatching(/\s+✅\spassed\s\d+\sms/),
        );
    });

    it('should trigger testFailed', async () => {
        const testFile = phpUnitProject('tests/AssertionsTest.php');
        const filter = 'test_failed|test_passed';
        await run(testFile, filter);

        const outputChannel = getOutputChannel();
        expect(outputChannel.appendLine).toHaveBeenCalledWith(
            expect.stringMatching(/\s+❌\sfailed\s\d+\sms/),
        );
        expect(outputChannel.append).toHaveBeenCalledWith(
            expect.stringContaining(
                `     ┐ ${EOL}` +
                `     ├ Failed asserting that false is true.${EOL}` +
                `     │ ${EOL}` +
                `     │ ${phpUnitProject('tests/AssertionsTest.php')}:22${EOL}`,
            ),
        );
    });

    it('should trigger testFailed with actual and expect', async () => {
        let DOT = '';
        let ARRAY_OPEN = '(';
        let ARRAY_CLOSE = ')';
        if (semver.gte(PHPUNIT_VERSION, '10.4.2')) {
            DOT = ',';
            ARRAY_OPEN = '[';
            ARRAY_CLOSE = ']';
        }

        const testFile = phpUnitProject('tests/AssertionsTest.php');
        const filter = 'test_is_not_same';
        await run(testFile, filter);

        const outputChannel = getOutputChannel();
        expect(outputChannel.appendLine).toHaveBeenCalledWith(
            expect.stringMatching(/\s+❌\sis_not_same\s\d+\sms/),
        );
        expect(outputChannel.append).toHaveBeenCalledWith(
            expect.stringContaining(
                `     ┐ ${EOL}` +
                `     ├ Failed asserting that two arrays are identical.${EOL}` +
                `     ┊ ---·Expected Array &0 ${ARRAY_OPEN}${EOL}` +
                `     ┊     'a' => 'b'${DOT}${EOL}` +
                `     ┊     'c' => 'd'${DOT}${EOL}` +
                `     ┊ ${ARRAY_CLOSE}${EOL}` +
                `     ┊ +++·Actual Array &0 ${ARRAY_OPEN}${EOL}` +
                `     ┊     'e' => 'f'${DOT}${EOL}` +
                `     ┊     0 => 'g'${DOT}${EOL}` +
                `     ┊     1 => 'h'${DOT}${EOL}` +
                `     ┊ ${ARRAY_CLOSE}${EOL}` +
                `     │ ${EOL}` +
                `     │ ${phpUnitProject('tests/AssertionsTest.php')}:27${EOL}`,
            ),
        );
    });

    it('should trigger testIgnored', async () => {
        const testFile = phpUnitProject('tests/AssertionsTest.php');
        const filter = 'test_skipped';
        await run(testFile, filter);

        const outputChannel = getOutputChannel();
        expect(outputChannel.appendLine).toHaveBeenCalledWith(
            expect.stringMatching(/\s+➖\sskipped\s\d+\sms/),
        );
    });

    it('should trigger testResultSummary', async () => {
        if (semver.lt(PHPUNIT_VERSION, '10.0.0')) {
            return;
        }

        const testFile = phpUnitProject('tests/AssertionsTest.php');
        await run(testFile);

        const outputChannel = getOutputChannel();
        expect(outputChannel.appendLine).toHaveBeenCalledWith(
            expect.stringMatching(/Tests: \d+, Assertions: \d+/),
        );
    });

    it('should trigger timeAndMemory', async () => {
        if (semver.lt(PHPUNIT_VERSION, '10.0.0')) {
            return;
        }

        const testFile = phpUnitProject('tests/AssertionsTest.php');
        await run(testFile);

        const outputChannel = getOutputChannel();
        expect(outputChannel.appendLine).toHaveBeenCalledWith(
            expect.stringMatching(/Time: [\d:.]+(\s\w+)?, Memory: [\d.]+\s\w+/),
        );
    });

    it('should trigger error', async () => {
        const testFile = phpUnitProject('tests/NotFound.php');
        await run(testFile);

        const outputChannel = getOutputChannel();
        expect(outputChannel.clear).toHaveBeenCalled();
        expect(outputChannel.append).toHaveBeenCalledWith(expect.stringMatching('❌'));
        expect(outputChannel.append).toHaveBeenCalledWith(expect.stringMatching(/NotFound\.php/));
    });

    it('always show output channel', async () => {
        const testFile = phpUnitProject('tests/AssertionsTest.php');
        const filter = 'test_passed';
        await run(testFile, filter, { showAfterExecution: 'always' });

        const outputChannel = getOutputChannel();
        expect(outputChannel.show).toHaveBeenCalled();
    });

    it('should not show output channel when successful', async () => {
        const testFile = phpUnitProject('tests/AssertionsTest.php');
        const filter = 'test_passed';
        await run(testFile, filter, { showAfterExecution: 'onFailure' });

        const outputChannel = getOutputChannel();
        expect(outputChannel.show).not.toHaveBeenCalled();
    });

    it('should show output channel when failure', async () => {
        const testFile = phpUnitProject('tests/AssertionsTest.php');
        const filter = 'test_failed|test_passed';
        await run(testFile, filter, { showAfterExecution: 'onFailure' });

        const outputChannel = getOutputChannel();
        expect(outputChannel.show).toHaveBeenCalled();
    });

    it('should show output channel when file not found', async () => {
        const testFile = phpUnitProject('tests/NotFound.php');
        await run(testFile, undefined, { showAfterExecution: 'onFailure' });

        const outputChannel = getOutputChannel();
        expect(outputChannel.show).toHaveBeenCalled();
    });

    it('never show output channel when successful', async () => {
        const testFile = phpUnitProject('tests/AssertionsTest.php');
        const filter = 'test_passed';
        await run(testFile, filter, { showAfterExecution: 'never' });

        const outputChannel = getOutputChannel();
        expect(outputChannel.show).not.toHaveBeenCalled();
    });

    it('never show output channel when failure', async () => {
        const testFile = phpUnitProject('tests/AssertionsTest.php');
        const filter = 'test_failed|test_passed';
        await run(testFile, filter, { showAfterExecution: 'never' });

        const outputChannel = getOutputChannel();
        expect(outputChannel.show).not.toHaveBeenCalled();
    });

    it('never show output channel when failure', async () => {
        const testFile = phpUnitProject('tests/NotFound.php');
        await run(testFile, undefined, { showAfterExecution: 'never' });

        const outputChannel = getOutputChannel();
        expect(outputChannel.show).not.toHaveBeenCalled();
    });

    it('should not clear output channel', async () => {
        const testFile = phpUnitProject('tests/AssertionsTest.php');
        const filter = 'test_passed';
        await run(testFile, filter, { clearOutputOnRun: false });

        const outputChannel = getOutputChannel();
        expect(outputChannel.clear).not.toHaveBeenCalled();
    });

    it('should print printed output', async () => {
        const testFile = phpUnitProject('tests/Output/OutputTest.php');
        const filter = 'test_echo';
        await run(testFile, filter);

        const outputChannel = getOutputChannel();
        expect(outputChannel.appendLine).toHaveBeenCalledWith('🟨 printed output');
        expect(outputChannel.show).toHaveBeenCalled();
    });

    it('should print printed output when die', async () => {
        const testFile = phpUnitProject('tests/Output/OutputTest.php');
        const filter = 'test_die';
        await run(testFile, filter);

        const outputChannel = getOutputChannel();
        expect(outputChannel.appendLine).toHaveBeenCalledWith('🟨 printed output when die');
        expect(outputChannel.show).toHaveBeenCalled();
    });
});
