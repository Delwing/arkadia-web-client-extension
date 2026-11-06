import ObjectList from '@web/objectList/ObjectList';
import { MockClient, installPipWindow, uninstallPipWindow } from '../support';

vi.mock('@modules/core/storage', async () => (await import('../support')).storageMockModule());

// PiP is driven by the ObjectList shell (the header's `objectList.togglePip`
// event ends in `pip.toggle()`); these open it through the shell.
describe('PictureInPictureSync', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    uninstallPipWindow();
  });

  test('hides picture-in-picture control when unsupported', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    const client = new MockClient();
    new ObjectList(client as any);
    expect(document.getElementById('objects-list-pip-button')).toBeNull();
    const container = document.getElementById('objects-list') as HTMLElement;
    expect(container.classList.contains('objects-list-pip-supported')).toBe(false);
  });

  test('opens picture-in-picture window when supported', async () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    document.title = 'Arkadia';
    const { pipDoc, pipWindow, handlers, requestWindow } = installPipWindow();

    const client = new MockClient();
    const objectList: any = new ObjectList(client as any);
    const objects = [ { shortcut: '1', desc: 'Orc', num: 123 } ];
    client.ObjectManager.getObjectsOnLocation = () => objects;
    objectList.render();

    await objectList.pip.toggle();
    expect(requestWindow).toHaveBeenCalled();
    expect(pipDoc.body.querySelector('#objects-list-pip')?.innerHTML).toContain('object-num');
    expect(objectList.pip.pipWindow).toBeTruthy();
    expect(pipDoc.title).toBe('Arkadia');
    expect(pipDoc.head.querySelector('style[data-objects-list-pip]')?.textContent).toContain('#objects-list-pip');

    document.title = 'Arkadia - Battle';
    await Promise.resolve();
    await Promise.resolve();
    expect(pipDoc.title).toBe('Arkadia - Battle');

    handlers.pagehide?.call(pipWindow, undefined);
    expect(objectList.pip.pipWindow).toBeNull();
  });

  test('picture-in-picture entries remain clickable', async () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    const { pipDoc } = installPipWindow();

    const client = new MockClient();
    const objectList: any = new ObjectList(client as any);
    client.ObjectManager.getObjectsOnLocation = () => [
      { shortcut: '1', desc: 'Goblin', num: 7 },
    ];
    objectList.render();

    await objectList.pip.toggle();

    const pipNum = pipDoc.body.querySelector('.object-num[data-object-num="1"]') as HTMLElement;
    expect(pipNum).toBeTruthy();
    pipNum.click();
    expect(client.sendCommand).toHaveBeenCalledWith('zabij ob_7');

    const pipDesc = pipDoc.body.querySelector('.object-desc[data-object-num="1"]') as HTMLElement;
    expect(pipDesc).toBeTruthy();
    pipDesc.click();
    expect(client.sendCommand).toHaveBeenCalledWith('/za 1');
  });

  test('picture-in-picture shows status header and footer', async () => {
    document.body.innerHTML = `
      <span id="cover-timer">Zas: 1.50</span>
      <div id="main_text_output_msg_wrapper">
        <div class="output_msg"><div class="output_msg_text"><span class="ansi">Enemies incoming</span></div></div>
        <div id="split-bottom"></div>
      </div>
      <div id="objects-list"></div>
    `;
    const { pipDoc } = installPipWindow();

    const client = new MockClient();
    const objectList: any = new ObjectList(client as any);
    // The map announces its location label; the PiP header follows the announcements.
    client.emit('mapLocationLabel', '#101 Northern Gate');
    client.ObjectManager.getObjectsOnLocation = () => [
      { shortcut: '1', desc: 'Goblin', num: 7 },
    ];
    objectList.render();

    await objectList.pip.toggle();

    const pipRoot = pipDoc.body.querySelector('#objects-list-pip') as HTMLElement;
    expect(pipRoot).toBeTruthy();
    const getHeaderHtml = () =>
      (pipRoot.querySelector('.objects-list-pip-header') as HTMLElement | null)?.innerHTML || '';
    const getFooterHtml = () =>
      (pipRoot.querySelector('.objects-list-pip-footer-content') as HTMLElement | null)?.innerHTML || '';
    const getBodyHtml = () =>
      (pipRoot.querySelector('.objects-list-pip-body') as HTMLElement | null)?.innerHTML || '';

    expect(getHeaderHtml()).toContain('#101 Northern Gate');
    expect(getHeaderHtml()).toContain('Zas: 1.50');
    expect(getBodyHtml()).toContain('Goblin');
    const initialFooterHtml = getFooterHtml();
    expect(initialFooterHtml).toContain('Enemies incoming');
    expect(initialFooterHtml).toContain('span class="ansi"');

    client.emit('mapLocationLabel', '#202 Southern Gate');
    expect(getHeaderHtml()).toContain('#202 Southern Gate');

    const coverEl = document.getElementById('cover-timer')!;
    coverEl.textContent = 'Zas: OK';
    await Promise.resolve();
    expect(getHeaderHtml()).toContain('Zas: OK');

    const wrapper = document.getElementById('main_text_output_msg_wrapper')!;
    const msg = document.createElement('div');
    msg.className = 'output_msg';
    const msgText = document.createElement('div');
    msgText.className = 'output_msg_text';
    msgText.innerHTML = '<span class="ansi">All clear</span>';
    msg.appendChild(msgText);
    wrapper.insertBefore(msg, document.getElementById('split-bottom'));
    client.emit('output-sent');
    const footerHtml = getFooterHtml();
    expect(footerHtml).toContain('Enemies incoming');
    expect(footerHtml).toContain('All clear');
    expect(footerHtml.split('<br>').length).toBe(2);
  });

  test('picture-in-picture footer shows last two lines of multiline message', async () => {
    document.body.innerHTML = `
      <span id="cover-timer"></span>
      <div id="main_text_output_msg_wrapper">
        <div class="output_msg"><div class="output_msg_text">Initial</div></div>
        <div id="split-bottom"></div>
      </div>
      <div id="objects-list"></div>
    `;
    const { pipDoc } = installPipWindow();

    const client = new MockClient();
    const objectList: any = new ObjectList(client as any);
    objectList.render();
    objectList.pip.handleOutputUpdate();

    await objectList.pip.toggle();

    const wrapper = document.getElementById('main_text_output_msg_wrapper')!;
    const msg = document.createElement('div');
    msg.className = 'output_msg';
    const msgText = document.createElement('div');
    msgText.className = 'output_msg_text';
    msgText.innerHTML = '<span class="ansi">First line</span><br><span class="ansi">Second line</span>\n<span class="ansi">Third line</span>';
    msg.appendChild(msgText);
    wrapper.insertBefore(msg, document.getElementById('split-bottom'));
    objectList.pip.handleOutputUpdate();

    const footerHtml = (
      pipDoc.body.querySelector('.objects-list-pip-footer-content') as HTMLElement | null
    )?.innerHTML || '';
    expect(footerHtml).not.toContain('First line');
    expect(footerHtml).toContain('Second line');
    expect(footerHtml).toContain('Third line');
    expect(footerHtml.split('<br>').length).toBe(2);
  });

  test('picture-in-picture inherits objects list styling changes', async () => {
    document.body.innerHTML = '<div id="objects-list" style="font-size: 0.9rem; font-family: Courier, monospace;"></div>';
    const container = document.getElementById('objects-list') as HTMLElement;
    const { pipDoc } = installPipWindow();

    const client = new MockClient();
    const objectList: any = new ObjectList(client as any);
    await objectList.pip.toggle();

    expect(pipDoc.body.style.fontSize).toBe('0.9rem');
    expect(pipDoc.body.style.fontFamily).toContain('Courier');
    expect(pipDoc.body.style.border).toBe('');

    container.style.fontSize = '1.5rem';
    container.style.fontFamily = 'serif';
    await Promise.resolve();
    await Promise.resolve();

    expect(pipDoc.body.style.fontSize).toBe('1.5rem');
    expect(pipDoc.body.style.fontFamily).toContain('serif');
  });
});
