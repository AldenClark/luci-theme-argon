'use strict';
'require baseclass';
'require ui';

const preferenceKey = 'argon-common-navigation-v1';

function sections() {
	return [
		['status', _('Overview'), [
			[ _('Router overview'), _('View live system, network and connection information.'), ['admin', 'status', 'overview'] ],
			[ _('Real-time bandwidth'), _('Open LuCI’s live per-interface bandwidth graph.'), ['admin', 'status', 'realtime', 'bandwidth'] ],
			[ _('System log'), _('Read recent router events and errors.'), ['admin', 'status', 'logs', 'syslog'] ]
		]],
		['devices', _('Devices'), [
			[ _('Device inventory'), _('See known devices, addresses and device settings.'), ['admin', 'suliu-devices', 'inventory', 'current'], ['admin', 'suliu-devices', 'inventory'] ],
		]],
		['network', _('Network'), [
			[ _('Interfaces'), _('Manage LAN, WAN and other network interfaces.'), ['admin', 'network', 'network'] ],
			[ _('Wireless'), _('Manage Wi-Fi radios and wireless networks.'), ['admin', 'network', 'wireless'] ],
			[ _('DHCP and DNS'), _('Configure local addresses and name resolution.'), ['admin', 'network', 'dhcp'] ],
			[ _('Firewall'), _('Manage traffic rules and firewall zones.'), ['admin', 'network', 'firewall', 'zones'], ['admin', 'network', 'firewall'] ],
			[ _('Port forwards'), _('Open the native IPv4 port forwarding rules.'), ['admin', 'network', 'firewall', 'forwards'] ]
		]],
		['services', _('Services'), [
			[ _('Dynamic DNS'), _('View and update dynamic DNS tasks.'), ['admin', 'services', 'suliu-ddns', 'tasks'] ],
			[ _('Notifications'), _('Manage router notifications.'), ['admin', 'services', 'suliu-notify', 'overview'] ],
			[ _('Certificates'), _('Manage certificate issuance and deployment.'), ['admin', 'services', 'suliu-acme', 'certificates'] ]
		]],
		['system', _('System'), [
			[ _('System settings'), _('Configure the router name, time and other system settings.'), ['admin', 'system', 'system'] ],
			[ _('Administration'), _('Manage access to the router.'), ['admin', 'system', 'admin', 'password'], ['admin', 'system', 'admin'] ],
			[ _('Backup and upgrade'), _('Back up configuration or open the firmware upgrade tools.'), ['admin', 'system', 'flash'] ]
		]]
	];
}

// Use the same authenticated, dependency- and ACL-filtered tree as Argon's full menu.
// Never probe guessed routes or elevate an unavailable entry.
function resolveRoute(tree, path) {
	let node = tree;
	for (const segment of path) {
		if (!node || !node.children)
			return null;
		node = ui.menu.getChildren(node).find(child => child.name === segment && child.title);
	}
	return node && node.action ? path : null;
}

function availableSections(tree) {
	return sections().map(([id, title, definitions]) => {
		const items = definitions.flatMap(([name, detail, ...paths]) => {
			const path = paths.map(candidate => resolveRoute(tree, candidate)).find(Boolean);
			return path ? [{ name, detail, path }] : [];
		});
		return { id, title, items };
	}).filter(section => section.items.length);
}

function isActive(path) {
	const current = L.env.dispatchpath || [];
	return current.length === path.length && path.every((segment, i) => current[i] === segment);
}

function link(item, className, markCurrent) {
	return E('a', {
		'class': className,
		'href': L.url(...item.path),
		'aria-current': markCurrent && isActive(item.path) ? 'page' : null
	}, [item.name]);
}

function compactMenu(groups, logout) {
	const menu = E('div', { 'class': 'argon-common-navigation', 'hidden': true });
	for (const group of groups) {
		menu.appendChild(E('div', { 'class': 'argon-common-nav-group' }, [
			E('p', { 'class': 'argon-common-nav-label' }, [group.title]),
			E('ul', {}, group.items.map(item => E('li', {}, [link(item, 'argon-common-nav-link', true)])))
		]));
	}
	if (logout)
		menu.appendChild(E('div', { 'class': 'argon-common-nav-group' }, [
			link({ name: _('Log out'), path: logout }, 'argon-common-nav-link', false)
		]));
	return menu;
}

function sidebarControls(tree, groups, nativeMenu, panel) {
	const sidebar = nativeMenu.parentNode;
	if (sidebar.querySelector('.argon-common-controls'))
		return;

	const common = compactMenu(groups, resolveRoute(tree, ['admin', 'logout']));
	common.id = 'argon-common-navigation';
	const picker = E('button', {
		'type': 'button',
		'aria-controls': common.id,
		'aria-expanded': 'false'
	}, [_('Show common menu')]);
	const controls = E('div', { 'class': 'argon-common-controls' }, [picker]);
	sidebar.insertBefore(controls, nativeMenu);
	sidebar.insertBefore(common, nativeMenu);

	function apply(compact) {
		common.hidden = !compact;
		common.toggleAttribute('inert', !compact);
		nativeMenu.classList.toggle('argon-common-native-hidden', compact);
		nativeMenu.toggleAttribute('inert', compact);
		picker.setAttribute('aria-expanded', String(compact));
		picker.textContent = compact ? _('Show full menu') : _('Show common menu');
		if (panel)
			panel.hidden = !compact;
	}
	let compact = false;
	try { compact = window.localStorage.getItem(preferenceKey) === 'common'; } catch (_) { /* private storage can be disabled */ }
	apply(compact);
	picker.addEventListener('click', () => {
		compact = !compact;
		apply(compact);
		try { window.localStorage.setItem(preferenceKey, compact ? 'common' : 'full'); } catch (_) { /* current page still works */ }
	});
}

function insertPanel(panel) {
	const container = document.querySelector('#maincontent > .container');
	if (!container || container.querySelector('.argon-common-panel'))
		return null;
	const tabs = document.querySelector('#tabmenu');
	if (tabs && tabs.parentNode === container)
		tabs.after(panel);
	else
		container.prepend(panel);
	return panel;
}

function guideDetail(item) {
	switch (item.path.slice(1).join('/')) {
	case 'suliu-devices/inventory':
	case 'suliu-devices/inventory/current':
		return _('Open a device to edit its settings. Fixed IPv4, port forwards and DDNS are separate settings.');
	case 'network/network':
		return _('Start with LAN or WAN. After a LAN address change, reconnect to the router at its new address.');
	case 'network/wireless':
		return _('Choose the Wi-Fi network you want to edit. Changing its name or password may disconnect wireless clients.');
	case 'network/dhcp':
		return _('Choose the relevant interface before changing address assignment or DNS settings.');
	case 'network/firewall':
	case 'network/firewall/zones':
		return _('Choose the source and destination zones before editing rules. Open Port Forwards to publish a specific port.');
	case 'network/firewall/forwards':
		return _('A port forward sends traffic from one external port to a chosen internal IP and port. Use a stable destination address.');
	case 'services/suliu-ddns/tasks':
		return _('Check the resolved address and last update. Creating a DNS record does not itself publish a Web service.');
	case 'services/suliu-notify/overview':
		return _('Set up a delivery channel first, then choose which events should send notifications.');
	case 'services/suliu-acme/certificates':
		return _('Issuing a certificate and deploying it to a service are separate steps. Check both states.');
	case 'system/system':
		return _('Start here for router identity and time settings. Open Administration for access settings.');
	case 'system/admin':
	case 'system/admin/password':
		return _('Check how you will get back into the router before changing an access method.');
	case 'system/flash':
		return _('Download a configuration backup before starting an upgrade.');
	default:
		return item.detail;
	}
}

function nativePageGuide(groups) {
	const item = groups.filter(group => group.id !== 'status')
		.flatMap(group => group.items).find(item => isActive(item.path));
	if (!item)
		return null;
	return insertPanel(E('section', { 'class': 'argon-common-panel argon-common-guide',
		'aria-labelledby': 'argon-common-title', 'hidden': true }, [
		E('p', { 'class': 'argon-common-kicker' }, [_('Quick guide')]),
		E('h2', { 'id': 'argon-common-title' }, [item.name]),
		E('p', { 'class': 'argon-common-intro' }, [guideDetail(item)]),
		E('p', { 'class': 'argon-common-intro' }, [_('Use the existing controls below. Changes are handled by LuCI and its installed apps.')])
	]));
}

function overviewCards(groups) {
	if (!['admin-status', 'admin-status-overview'].includes(document.body.dataset.page))
		return null;
	const cards = groups.map(group => E('div', { 'class': 'argon-common-card' }, [
		E('h3', {}, [group.title]),
		E('ul', {}, group.items.map(item => E('li', {}, [
			link(item, 'argon-common-card-link', false),
			E('p', {}, [item.detail])
		])))
	]));
	return insertPanel(E('section', { 'class': 'argon-common-panel argon-common-overview', 'aria-labelledby': 'argon-common-title', 'hidden': true }, [
		E('p', { 'class': 'argon-common-kicker' }, [_('Router shortcuts')]),
		E('h2', { 'id': 'argon-common-title' }, [_('Common pages')]),
		E('p', { 'class': 'argon-common-intro' }, [_('Open a common task below. Live router status remains on this page.')]),
		E('div', { 'class': 'argon-common-grid' }, cards)
	]));
}

function render(tree, nativeMenu) {
	if (!tree || !L.env.dispatchpath || L.env.dispatchpath[0] !== 'admin')
		return;
	const groups = availableSections(tree);
	if (!groups.length)
		return;

	// Do not replace or reload the actual page, forms, polling, or status widgets.
	const panel = overviewCards(groups) || nativePageGuide(groups);
	sidebarControls(tree, groups, nativeMenu, panel);
}

return baseclass.extend({
	render: function(tree) {
		const sidebar = document.querySelector('#mainmenu');
		const nativeMenu = sidebar && Array.from(sidebar.children).find(node => node.classList.contains('nav'));
		if (nativeMenu)
			render(tree, nativeMenu);
	}
});
