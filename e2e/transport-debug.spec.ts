import {expect, test} from './support/fixtures';
import {ensureGameSocket, GMCP_PATHS, pushGmcp, pushText, submitCommand, waitForCommandInput, waitForMapReady} from './support/mocks';

test.describe('Transport debug', () => {
    test('check if transport timer appears with proper setup', async ({page}) => {
        // Capture browser console logs
        page.on('console', msg => {
            if (msg.text().includes('[E2E]')) {
                console.log('BROWSER:', msg.text());
            }
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);

        // Set up listeners for all relevant events
        await page.evaluate(() => {
            const client = (window as any).clientExtension;
            (window as any).timerEvents = [];
            (window as any).enterLocationEvents = [];
            (window as any).gmcpRoomInfoEvents = [];

            client.on('transportTimer', (payload: any) => {
                console.log('[E2E] transportTimer event:', payload);
                (window as any).timerEvents.push(payload);
            });

            client.on('enterLocation', (payload: any) => {
                console.log('[E2E] enterLocation event:', payload);
                (window as any).enterLocationEvents.push(payload);
            });

            client.on('gmcp.room.info', (payload: any) => {
                console.log('[E2E] gmcp.room.info event:', payload);
                (window as any).gmcpRoomInfoEvents.push(payload);
            });
        });

        // Send location update using GMCP (this is the proper way)
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 6429,
            id: 6429,
            name: 'Przystan na Blekitnej Wstedze',
            zone: 'Blekitna Wstega',
            map: {
                x: 0,
                y: 0,
                name: 'Transport Docks',
            },
        });
        await page.waitForTimeout(200);

        // Add logging to see what text is being parsed and what triggers exist
        await page.evaluate(() => {
            const client = (window as any).clientExtension;
            (window as any).parsedLines = [];
            (window as any).triggerExecutions = [];
            (window as any).transportTriggers = [];

            // Log existing triggers
            const triggersCount = client.Triggers.triggers.size;
            console.log('[E2E] Total triggers registered:', triggersCount);

            // Check for transport-specific triggers
            for (const trigger of client.Triggers.triggers.values()) {
                if (trigger.tag === 'transport-tracker') {
                    const patternStr = trigger.pattern instanceof RegExp
                        ? trigger.pattern.source
                        : String(trigger.pattern);
                    (window as any).transportTriggers.push(patternStr);
                    console.log('[E2E] Transport trigger pattern:', patternStr);
                }
            }

            // Hook into parseLine
            const originalParseLine = client.Triggers.parseLine.bind(client.Triggers);
            client.Triggers.parseLine = function(buffer: any, gmcpType: string) {
                const text = buffer?.text || buffer?.toString() || String(buffer);

                // Count transport triggers at parse time
                let transportCount = 0;
                for (const t of this.triggers.values()) {
                    if (t.tag === 'transport-tracker') transportCount++;
                }

                (window as any).parsedLines.push({
                    text,
                    gmcpType,
                    triggersInCollection: this.triggers.size,
                    transportTriggersInCollection: transportCount
                });
                console.log('[E2E] Parsing line:', text, 'type:', gmcpType);
                console.log('[E2E] Triggers in collection:', this.triggers.size);
                console.log('[E2E] Transport triggers in collection:', transportCount);

                const result = originalParseLine(buffer, gmcpType);

                // Check if parseLine returned null (which would hide the text)
                console.log('[E2E] parseLine result:', result === null ? 'NULL' : 'non-null');

                return result;
            };

            // Hook into trigger execution to see which triggers are being called
            const Trigger = Object.getPrototypeOf(Array.from(client.Triggers.triggers.values())[0]).constructor;
            const originalExecute = Trigger.prototype.execute;
            Trigger.prototype.execute = function(line: any, type: string) {
                const text = line?.text || line?.toString() || String(line);
                const plainText = text.replace(/\s$/g, "");
                const pattern = this.pattern;
                const result = originalExecute.call(this, line, type);

                // Log ALL trigger executions
                const patternStr = pattern instanceof RegExp ? pattern.source : String(pattern).substring(0, 50);
                const tag = this.tag || 'no-tag';
                const matched = result !== line;
                const returnedNull = result === null;

                if (returnedNull) {
                    console.log('[E2E] !!! Trigger returned NULL (stopping iteration):', {
                        tag,
                        pattern: patternStr,
                        text: plainText
                    });
                }

                // Log ALL executions for transport triggers
                if (tag === 'transport-tracker') {
                    console.log('[E2E] Transport trigger executed:', {
                        pattern: patternStr,
                        text: plainText,
                        matched,
                        tag
                    });
                    if (matched) {
                        (window as any).triggerExecutions.push({ text: plainText, pattern: patternStr, type, tag });
                    }
                }
                return result;
            };
        });

        // Send boarding command and response
        await submitCommand(page, 'wejdz na statek');
        await page.waitForTimeout(50);
        await pushText(page, 'Wchodzisz na wielka galere.');
        await page.waitForTimeout(100);

        // Send departure text (no announcement needed - only one route from 6429)
        await pushText(page, 'Galera odbija od brzegu.');
        await page.waitForTimeout(200);

        // Check timer state and all events
        const result = await page.evaluate(() => {
            const timer = document.querySelector('#transport-timer');
            return {
                textContent: timer?.textContent || '',
                className: timer?.className || '',
                timerEvents: (window as any).timerEvents,
                enterLocationEvents: (window as any).enterLocationEvents,
                gmcpRoomInfoEvents: (window as any).gmcpRoomInfoEvents,
                parsedLines: (window as any).parsedLines,
                triggerExecutions: (window as any).triggerExecutions,
                transportTriggers: (window as any).transportTriggers,
            };
        });

        console.log('Timer state after departure:', result);
        console.log('Transport triggers registered:', result.transportTriggers.length, result.transportTriggers.slice(0, 10));
        console.log('GMCP room.info events:', result.gmcpRoomInfoEvents.length, result.gmcpRoomInfoEvents);
        console.log('enterLocation events:', result.enterLocationEvents.length, result.enterLocationEvents);
        console.log('Transport timer events:', result.timerEvents.length, result.timerEvents);
        console.log('Parsed lines:', result.parsedLines.length, result.parsedLines);
        console.log('Trigger executions:', result.triggerExecutions.length, result.triggerExecutions);

        expect(result.textContent, 'should show timer after departure').toContain('Tr:');
        expect(result.textContent, 'should show destination').toContain('Kraina Zgromadzenia');
    });
});
