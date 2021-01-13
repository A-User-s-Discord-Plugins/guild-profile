/*
 * Copyright (c) 2020 NurMarvin (Marvin Witt)
 * Licensed under the Open Software License version 3.0
 */

const { Plugin } = require('@vizality/entities');
const { patch, unpatch } = require('@vizality/patcher');
const { React, getModule, FluxDispatcher, i18n: { Messages } } = require('@vizality/webpack');
const { open } = require('@vizality/modal');
const { react:{ findInReactTree } } = require('@vizality/util')
const i18n = require('./i18n');

const GuildProfileModal = require('./components/GuildProfileModal');
const GuildProfileIcon = require('./components/GuildProfileIcon');

const memberCountsStore = require('./memberCountsStore/store');
const memberCountsActions = require('./memberCountsStore/actions');

module.exports = class GuildProfile extends Plugin {
  async start() {
    this.log('Icons provided by https://iconify.design/');
    vizality.api.i18n.injectAllStrings(i18n);
    this.injectStyles('styles.scss');
    this._patchContextMenu();
    this._patchMenu();

    _.bindAll(this, ['handleMemberListUpdate']);

    FluxDispatcher.subscribe('GUILD_MEMBER_LIST_UPDATE', this.handleMemberListUpdate);
  }

  handleMemberListUpdate(memberListUpdate) {
    this.updateMemberCounts(memberListUpdate);
  }

  getMemberCounts(id) {
    return new Promise((resolve) => {
      const memberCounts = memberCountsStore.getMemberCounts(id);

      // If the member count is in the Flux store just send that data 
      if (memberCounts) {
        resolve(memberCounts);
        return;
      }

      const { requestMembers } = getModule('requestMembers', false);
      requestMembers(id);

      const updateMemberCounts = (memberListUpdate) => {
        return this.updateMemberCounts(memberListUpdate);
      }

      function onReceived(memberListUpdate) {
        if (memberListUpdate.guildId === id) {
          resolve(updateMemberCounts(memberListUpdate));
        }
      }

      FluxDispatcher.subscribe('GUILD_MEMBER_LIST_UPDATE', onReceived);
    });
  }

  updateMemberCounts(memberListUpdate) {
    const { guildId, memberCount, groups } = memberListUpdate;
    const onlineCount = groups.map(group => group.id != "offline" ? group.count : 0).reduce((a, b) => {
      return a + b;
    }, 0);
    const memberCounts = { guildId, memberCount, onlineCount };

    memberCountsActions.updateMemberCounts(memberCounts);
    return memberCounts;
  }

  async _patchContextMenu() {
    const { MenuGroup, MenuItem } = await getModule('MenuItem');
    const GuildContextMenu = await getModule(m => m.default && m.default.displayName === 'GuildContextMenu');

    const getMemberCounts = (guildId) => {
      return this.getMemberCounts(guildId);
    }

    patch('guild-profile-context-menu', GuildContextMenu, 'default', ([{ guild }], res) => {
      res.props.children.splice(0, 0,
        React.createElement(MenuGroup, {},
          React.createElement(MenuItem, {
            id: 'guild-profile',
            key: 'guild-profile',
            label: Messages.GUILD_PROFILE,
            action: () => open(() => React.createElement(GuildProfileModal, { guild, section: 'GUILD_INFO', getMemberCounts }))
          })
        )
      );
      return res;
    });
    GuildContextMenu.default.displayName = 'GuildContextMenu';
  }

  async _patchMenu() {
    const id = 'guild-profile';
    const Menu = await getModule('MenuItem');
    const { getGuild } = await getModule('getGuild');
    const { getGuildId } = await getModule('getLastSelectedGuildId');

    const getMemberCounts = (guildId) => {
      return this.getMemberCounts(guildId);
    }

    patch('guild-profile-menu', Menu, 'default', ([{ children }], res) => {
      if (res.props.id !== 'guild-header-popout') return res;

      if (!findInReactTree(res, c => c.props && c.props.id == id)) {
        children.unshift(
          React.createElement(Menu.MenuGroup, null, React.createElement(Menu.MenuItem, {
            id,
            label: Messages.GUILD_PROFILE,
            icon: () => React.createElement(GuildProfileIcon),
            action: () => open(() => React.createElement(GuildProfileModal, { guild: getGuild(getGuildId()), section: 'GUILD_INFO', getMemberCounts }))
          }))
        );
      }
      return res;
    });
    Menu.default.displayName = 'Menu';
  }

  stop() {
    unpatch('guild-profile-context-menu');
    unpatch('guild-profile-menu');
    FluxDispatcher.unsubscribe('GUILD_MEMBER_LIST_UPDATE', this.handleMemberListUpdate);
  }
}
