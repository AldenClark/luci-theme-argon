'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const src = readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/argon-common-pages.js'), 'utf8');

function fixture(page, optional = true, saved, deniedStorage = false) {
	const nav = node('ul', { class: 'nav' }, [node('a', { href: '/native' }, ['An advanced native entry'])]);
	const sidebar = node('div', {}, [nav]);
	const live = node('div', { id: 'view' }, ['Live LuCI widget']);
	const tabs = node('div');
	const content = node('section', {}, [tabs, live]);
	const document = {
		body: { dataset: { page: page.join('-') } },
		querySelector: selector => ({
			'#mainmenu': sidebar,
			'#maincontent > .container': content,
			'#tabmenu': tabs
		}[selector] || null)
	};
	const tree = {};
	function add(parts, options = {}) {
		let entry = tree;
		for (const key of parts)
			entry = (entry.children ||= {})[key] ||= { title: key, satisfied: true };
		entry.action = { type: 'view' };
		Object.assign(entry, options);
	}
	for (const parts of [
		['status', 'overview'], ['status', 'realtime', 'bandwidth'], ['network', 'network'],
		['network', 'dhcp'], ['network', 'firewall', 'zones'], ['network', 'firewall', 'forwards'],
		['system', 'system'], ['logout']
	])
		add(['admin', ...parts]);
	if (optional) {
		add(['admin', 'suliu-devices', 'inventory', 'current']);
		add(['admin', 'services', 'suliu-ddns', 'tasks'], { readonly: true });
		add(['admin', 'services', 'suliu-notify', 'overview'], { satisfied: false });
		add(['admin', 'services', 'suliu-acme', 'certificates'], { title: null });
	}
	const ui = { menu: { getChildren: n => Object.entries(n.children || {})
		.filter(([, v]) => v.satisfied && Object.hasOwn(v, 'title'))
		.map(([name, v]) => ({ ...v, name })) } };
	const stored = new Map([['argon-common-navigation-v1', saved]]);
	const localStorage = {
		getItem(key) { if (deniedStorage) throw new Error('not allowed'); return stored.get(key); },
		setItem(key, val) { if (deniedStorage) throw new Error('not allowed'); stored.set(key, val); }
	};
	const win = { localStorage };
	const L = { env: { dispatchpath: page }, url: (...parts) => '/cgi-bin/luci/' + parts.join('/') };
	const feature = new Function('baseclass', 'ui', 'E', '_', 'L', 'document', 'window', src)(
		{ extend: o => o }, ui, node, t => t, L, document, win
	);
	feature.render(tree);
	return { feature, tree, nav, sidebar, content, live, stored,
		picker: sidebar.querySelector('.argon-common-controls')?.children[0],
		panel: content.querySelector('.argon-common-panel') };
}

function node(tag, attrs = {}, children = []) {
	const classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
	const element = {
		tag, attrs: { ...attrs }, children: [], listeners: {}, hidden: !!attrs.hidden,
		classList: {
			contains: s => classes.has(s),
			toggle(s, on) { if (on) classes.add(s); else classes.delete(s); }
		},
		textContent: children.filter(c => typeof c === 'string').join(''),
		appendChild(child) { child.parentNode = this; this.children.push(child); },
		insertBefore(child, target) { child.parentNode = this; this.children.splice(this.children.indexOf(target), 0, child); },
		prepend(child) { this.insertBefore(child, this.children[0]); },
		after(child) {
			const siblings = this.parentNode.children;
			this.parentNode.insertBefore(child, siblings[siblings.indexOf(this) + 1]);
		},
		querySelector(selector) { return descendants(this).find(n => n.classList.contains(selector.slice(1))) || null; },
		setAttribute(name, value) { this.attrs[name] = value; },
		toggleAttribute(name, on) { if (on) this.attrs[name] = ''; else delete this.attrs[name]; },
		addEventListener(type, handler) { this.listeners[type] = handler; },
		click() { this.listeners.click(); }
	};
	children.filter(c => typeof c === 'object').forEach(c => element.appendChild(c));
	return element;
}

function descendants(node) {
	return node.children.flatMap(child => [child, ...descendants(child)]);
}
function urls(node) {
	return descendants(node).filter(n => n.tag === 'a').map(n => n.attrs.href);
}

test('common overview uses actual routes while original live status and native menu remain in DOM', () => {
	const f = fixture(['admin', 'status', 'overview']);
	assert.equal(f.panel.hidden, true);
	assert.equal(f.nav.classList.contains('argon-common-native-hidden'), false);
	f.picker.click();
	assert.equal(f.panel.hidden, false);
	assert.ok(f.content.children.includes(f.live));
	assert.ok(f.sidebar.children.includes(f.nav));
	assert.equal(f.nav.classList.contains('argon-common-native-hidden'), true);
	assert.ok('inert' in f.nav.attrs);
	assert.equal(f.stored.get('argon-common-navigation-v1'), 'common');
	const actual = urls(f.panel);
	for (const route of ['status/realtime/bandwidth', 'suliu-devices/inventory/current',
		'network/firewall/forwards', 'services/suliu-ddns/tasks']) {
		assert.ok(actual.includes('/cgi-bin/luci/admin/' + route), route);
	}
	assert.ok(urls(f.sidebar).includes('/cgi-bin/luci/admin/logout'));
	assert.ok(!actual.some(v => v.includes('suliu-notify') || v.includes('suliu-acme')));
	f.picker.click();
	assert.equal(f.panel.hidden, true);
	assert.equal(f.nav.classList.contains('argon-common-native-hidden'), false);
	assert.ok(!('inert' in f.nav.attrs));
	assert.equal(f.stored.get('argon-common-navigation-v1'), 'full');
	f.feature.render(f.tree);
	assert.equal(descendants(f.sidebar).filter(n => n.classList.contains('argon-common-controls')).length, 1);
});

test('fresh generic installs omit unavailable plugin shortcuts; denied local storage remains usable', () => {
	const f = fixture(['admin', 'status', 'overview'], false, undefined, true);
	assert.ok(!urls(f.panel).some(v => v.includes('suliu-')));
	assert.doesNotThrow(() => f.picker.click());
	assert.equal(f.panel.hidden, false);
});

test('guidance applies only to matching native routes and common mode', () => {
	const f = fixture(['admin', 'network', 'firewall', 'forwards'], false, 'common');
	assert.equal(f.panel.hidden, false);
	assert.ok(descendants(f.panel).some(n => n.textContent.includes('stable destination address')));
	f.picker.click();
	assert.equal(f.panel.hidden, true);
	const advanced = fixture(['admin', 'network', 'firewall', 'rules'], false, 'common');
	assert.equal(advanced.panel, null);
	assert.ok(advanced.content.children.includes(advanced.live));
});
