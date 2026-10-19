/* Coleções Coloridas Zotero — cor e ícone personalizados para as coleções */

const PREF = 'extensions.colecoes-coloridas.map';
const FTL = 'colecoes-coloridas.ftl';
const PANEL = 'colecoes-coloridas-panel';
const HTML = 'http://www.w3.org/1999/xhtml';
const BASE = 'chrome://colecoes-coloridas/content/';
const BLUE = 'var(--accent-blue, #4072e5)';

const COLORS = ['#e53935', '#f4511e', '#fb8c00', '#fdd835', '#7cb342', '#43a047', '#00897b',
	'#00acc1', '#1e88e5', '#3949ab', '#8e24aa', '#d81b60', '#6d4c41', '#757575'];
const ICONS = {
	general: ['', 'folder-open', 'book', 'library', 'publications', 'note', 'page', 'abstract',
		'attachment', 'annotation', 'cite', 'tag', 'pin', 'link', 'globe', 'location',
		'magnifier', 'group', 'info', 'report', 'edit', 'tick', 'related', 'feed'],
	health: ['stethoscope', 'heartbeat', 'brain', 'bone', 'lungs', 'dental', 'eye', 'physotherapist',
		'stretching', 'wheelchair', 'run', 'apple', 'pill', 'vaccine', 'virus', 'baby-carriage'],
	science: ['microscope', 'flask', 'dna', 'atom', 'plant-2', 'paw', 'planet', 'math-function'],
	technology: ['code', 'cpu', 'device-laptop', 'database', 'cloud', 'robot', 'network', 'tool'],
	humanities: ['school', 'scale', 'chart-line', 'users-group', 'map', 'hourglass', 'message-circle', 'mood-smile'],
	arts: ['palette', 'music', 'movie', 'camera', 'language', 'feather', 'masks-theater', 'building-arch'],
};
const KNOWN = new Set(Object.values(ICONS).flat());
const SVG = name => `url(${BASE}icons/${KNOWN.has(name) && name || 'folder'}.svg)`;

const CSS = `
.cc { display: flex; flex-direction: column; gap: 8px; padding: 10px; }
.cc h3 { margin: 0; font-size: inherit; font-weight: 600; }
.cc h4 { margin: 8px 0 4px; font-size: inherit; font-weight: normal; opacity: .7; }
.cc h4:first-child { margin-top: 0; }
.cc .icons { max-height: 200px; overflow-y: auto; scrollbar-width: thin; margin: -3px; padding: 3px; }
.cc .grid { display: grid; grid-template-columns: repeat(8, 24px); gap: 6px; }
.cc .grid > * { appearance: none; box-sizing: border-box; width: 24px; height: 24px; margin: 0; padding: 0;
	border: 0; border-radius: 6px; background: center / 16px no-repeat; cursor: pointer; }
.cc .sw { border-radius: 50%; box-shadow: inset 0 0 0 1px rgb(0 0 0 / .15); }
.cc .sw[data-color=""] { background: linear-gradient(135deg, transparent 44%, #e53935 44% 56%, transparent 56%); }
.cc .custom { border-radius: 50%; background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); }
.cc .custom::-moz-color-swatch { opacity: 0; }
.cc .ic { -moz-context-properties: fill; fill: var(--cc); }
.cc .ic:hover { background-color: var(--fill-quinary, rgb(128 128 128 / .15)); }
.cc [aria-pressed="true"], .cc .on { outline: 2px solid ${BLUE}; outline-offset: 1px; }
.cc .reset { align-self: flex-end; margin: 0; }
`;

var map = {};
var chromeHandle;
var cleanups = new Map();

function startup({ id, rootURI }) {
	try { map = JSON.parse(Zotero.Prefs.get(PREF, true) || '{}'); } catch { map = {}; }
	chromeHandle = Components.classes['@mozilla.org/addons/addon-manager-startup;1']
		.getService(Components.interfaces.amIAddonManagerStartup)
		.registerChrome(Services.io.newURI(rootURI + 'manifest.json'), [['content', 'colecoes-coloridas', rootURI]]);
	// Zotero 8+: API oficial de menus, removida automaticamente quando o plugin é desativado
	Zotero.MenuManager?.registerMenu({
		menuID: 'colecoes-coloridas',
		pluginID: id,
		target: 'main/library/collection',
		menus: [{
			menuType: 'menuitem',
			l10nID: 'colecoes-coloridas-menu',
			icon: BASE + 'icon.svg',
			onShowing: (_, ctx) => ctx.setVisible(collections(ctx.collectionTreeRows).length > 0),
			onCommand: (_, ctx) => openPanel(ctx.menuElem.ownerGlobal, collections(ctx.collectionTreeRows)),
		}],
	});
	for (let window of Zotero.getMainWindows()) onMainWindowLoad({ window });
}

function shutdown(_, reason) {
	if (reason == APP_SHUTDOWN) return;
	for (let window of Zotero.getMainWindows()) onMainWindowUnload({ window });
	chromeHandle?.destruct();
}

function onMainWindowLoad({ window: win }) {
	if (cleanups.has(win)) return;
	let doc = win.document;
	let undo = [() => doc.getElementById(PANEL)?.remove(), () => doc.querySelector(`link[href="${FTL}"]`)?.remove()];
	cleanups.set(win, undo);
	win.MozXULElement.insertFTLIfNeeded(FTL);
	try {
		// Envolve o método que gera o ícone de cada linha da árvore de coleções
		let proto = win.require('zotero/collectionTree').prototype;
		let original = proto._getIcon;
		proto._getIcon = function (index) {
			let icon = original.apply(this, arguments);
			try { paint(icon, this.getRow(index)); } catch (e) { Zotero.logError(e); }
			return icon;
		};
		undo.push(() => proto._getIcon = original);
	} catch (e) { Zotero.logError(e); }
	if (!Zotero.MenuManager) addMenu(win, undo);
	refresh();
}

function onMainWindowUnload({ window: win }) {
	cleanups.get(win)?.forEach(fn => fn());
	cleanups.delete(win);
	refresh();
}

function install() {}
function uninstall() {}

// Zotero 7: item inserido diretamente no menu de contexto das coleções
function addMenu(win, undo) {
	let doc = win.document;
	let popup = doc.getElementById('zotero-collectionmenu');
	let item = doc.createXULElement('menuitem');
	let selected = () => collections([win.ZoteroPane.getCollectionTreeRow()]);
	let onShowing = e => e.target == popup && (item.hidden = !selected().length);
	item.className = 'menuitem-iconic';
	item.setAttribute('image', BASE + 'icon.svg');
	item.dataset.l10nId = 'colecoes-coloridas-menu';
	item.addEventListener('command', () => openPanel(win, selected()));
	popup.addEventListener('popupshowing', onShowing);
	popup.append(item);
	undo.push(() => {
		popup.removeEventListener('popupshowing', onShowing);
		item.remove();
	});
}

function collections(rows = []) {
	return rows.filter(row => row?.isCollection()).map(row => row.ref);
}

function paint(icon, row) {
	let style = row.isCollection() && map[row.ref.libraryKey];
	if (!style) return;
	icon.style.background = `${SVG(style.icon)} center / 16px no-repeat`;
	icon.style.setProperty('-moz-context-properties', 'fill');
	icon.style.fill = style.color || BLUE;
}

function refresh() {
	for (let win of Zotero.getMainWindows()) win.ZoteroPane?.collectionsView?.tree?.invalidate();
}

function update(targets, patch) {
	for (let { libraryKey } of targets) {
		let style = { ...map[libraryKey], ...patch };
		for (let key in style) if (!style[key]) delete style[key];
		if (Object.keys(style).length) map[libraryKey] = style;
		else delete map[libraryKey];
	}
	Zotero.Prefs.set(PREF, JSON.stringify(map), true);
	refresh();
}

function openPanel(win, targets) {
	if (!targets.length) return;
	let doc = win.document;
	let panel = doc.getElementById(PANEL) || buildPanel(doc);
	panel.targets = targets;
	sync(panel);
	panel.addEventListener('popupshown', () => {
		// Mostra a categoria do ícone atual (título + ícones)
		panel.querySelector('.ic[aria-pressed="true"]')?.parentNode.previousSibling.scrollIntoView({ block: 'start' });
	}, { once: true });
	// Ancorado na árvore (estável), pois as linhas são recriadas a cada atualização
	let tree = doc.getElementById('zotero-collections-tree');
	let t = tree.getBoundingClientRect();
	let r = tree.querySelector('.row.focused, .row.selected')?.querySelector('.cell-icon')?.getBoundingClientRect() || t;
	panel.openPopup(tree, 'overlap', r.left - t.left, r.bottom - t.top + 4);
}

function buildPanel(doc) {
	let add = (parent, tag, props = {}, data = {}) => {
		let el = Object.assign(doc.createElementNS(HTML, tag), props);
		Object.assign(el.dataset, data);
		parent.append(el);
		return el;
	};
	let panel = doc.createXULElement('panel');
	panel.id = PANEL;
	panel.setAttribute('type', 'arrow');
	let box = add(panel, 'div', { className: 'cc' });
	add(box, 'style', { textContent: CSS });

	add(box, 'h3', {}, { l10nId: 'colecoes-coloridas-color' });
	let colors = add(box, 'div', { className: 'grid' });
	add(colors, 'button', { className: 'sw' }, { color: '', l10nId: 'colecoes-coloridas-none' });
	for (let color of COLORS) {
		add(colors, 'button', { className: 'sw', title: color }, { color }).style.backgroundColor = color;
	}
	add(colors, 'input', { type: 'color', className: 'custom' }, { l10nId: 'colecoes-coloridas-custom' });

	add(box, 'h3', {}, { l10nId: 'colecoes-coloridas-icon' });
	let list = add(box, 'div', { className: 'icons' });
	for (let [category, icons] of Object.entries(ICONS)) {
		add(list, 'h4', {}, { l10nId: `colecoes-coloridas-${category}` });
		let grid = add(list, 'div', { className: 'grid' });
		for (let icon of icons) {
			add(grid, 'button', { className: 'ic' }, { icon }).style.backgroundImage = SVG(icon);
		}
	}
	add(box, 'button', { className: 'reset' }, { reset: '', l10nId: 'colecoes-coloridas-reset' });

	let apply = patch => {
		update(panel.targets, patch);
		sync(panel);
	};
	box.addEventListener('click', ({ target }) => {
		let { color, icon, reset } = target.dataset;
		if (reset !== undefined) apply({ color: '', icon: '' });
		else if (color !== undefined && target.localName == 'button') apply({ color });
		else if (icon !== undefined) apply({ icon });
	});
	box.addEventListener('input', ({ target }) => apply({ color: target.value }));

	doc.querySelector('popupset').append(panel);
	return panel;
}

// Destaca as opções atuais da (primeira) coleção selecionada
function sync(panel) {
	let style = map[panel.targets[0].libraryKey] || {};
	let box = panel.firstChild;
	box.style.setProperty('--cc', style.color || BLUE);
	for (let el of box.querySelectorAll('button[data-color], button[data-icon]')) {
		let { color, icon } = el.dataset;
		el.setAttribute('aria-pressed', color !== undefined ? color == (style.color || '') : icon == (style.icon || ''));
	}
	let custom = box.querySelector('.custom');
	custom.value = style.color || '#4072e5';
	custom.classList.toggle('on', !!style.color && !COLORS.includes(style.color));
}
