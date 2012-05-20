// Multiple Monitor Panels
// Copyright (C) 2012 darkxst

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

// Author: darkxst

const Panel = imports.ui.panel;
const Main = imports.ui.main;
const Lang = imports.lang;

const Shell = imports.gi.Shell;
const Tweener = imports.ui.tweener;
const Overview = imports.ui.overview;

const St = imports.gi.St;



let panels;

const ExtraPanels = new Lang.Class({
	Name: 'ExtraPanels',

	_init : function() {
		this.monitors = Main.layoutManager.monitors;
		this.primaryIndex = Main.layoutManager.primaryIndex;
		this.panelBoxes = [];
		this.panels = [];
		Main.layoutManager.panelBoxes = this.panelBoxes;
		
		for (let i = 0; i < this.monitors.length; i++) {
            if (i == this.primaryIndex)
				continue;

			log("monitor: "+i);
			this.panelBoxes[i] = new St.BoxLayout({ name: 'panelBox'+(i+1), vertical: true });
			Main.layoutManager.addChrome(this.panelBoxes[i], { affectsStruts: true });
			this.panels[i] = new Panel.Panel();
			Main.layoutManager.panelBox.remove_actor(this.panels[i].actor);
			this.panelBoxes[i].add(this.panels[i].actor)
			this.panelBoxes[i].set_position(this.monitors[i].x, this.monitors[i].y);
		}
	},
	destroy : function(){

		for (let i = 0; i < this.monitors.length; i++) {
            if (i == this.primaryIndex)
				continue;
			this.panels[i].actor.destroy();
			this.panelBoxes = null;
		}
	}
});

const NewAppMenuButton = new Lang.Class({
    Name: 'NewAppMenuButton',
    Extends: Panel.AppMenuButton,

	_init: function(monitorIndex){
		log("loading newAppMenu");
		this.parent(Main.panel._menus);
		this.monitorIndex = monitorIndex;
		this.lastFocusedApp = Shell.WindowTracker.get_default().focus_app;
		this.prevFocusedApp = null;
	},
	_onAppStateChanged: function(appSys, app) {
        let state = app.state;
        if (state != Shell.AppState.STARTING) {
            this._startingApps = this._startingApps.filter(function(a) {
                return a != app;
            });
        } else if (state == Shell.AppState.STARTING && this.monitorIndex == global.display.focus_window.get_monitor() ) {
            this._startingApps.push(app);
        }
        // For now just resync on all running state changes; this is mainly to handle
        // cases where the focused window's application changes without the focus
        // changing.  An example case is how we map OpenOffice.org based on the window
        // title which is a dynamic property.
        this._sync();
    },

	_sync: function() {
        let tracker = Shell.WindowTracker.get_default();
        let focusedApp = tracker.focus_app;

		
        let lastStartedApp = null;
        let workspace = global.screen.get_active_workspace();
        for (let i = 0; i < this._startingApps.length; i++)
            if (this._startingApps[i].is_on_workspace(workspace))
                lastStartedApp = this._startingApps[i];

        let targetApp = focusedApp != null ? focusedApp : lastStartedApp;

		if (global.display.focus_window){
			if (this.monitorIndex != global.display.focus_window.get_monitor()){
				if (this.lastFocusedApp)				
					targetApp = this.lastFocusedApp.state == Shell.AppState.STOPPED ? this.prevFocusedApp : this.lastFocusedApp;				
			} else {
				this.prevFocusedApp = this.lastFocusedApp;
				this.lastFocusedApp = targetApp;
			}		
		}

        if (targetApp == null) {
            if (!this._targetIsCurrent)
                return;

            this.actor.reactive = false;
            this._targetIsCurrent = false;

            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, { opacity: 0,
                                           time: Overview.ANIMATION_TIME,
                                           transition: 'easeOutQuad' });
            return;
        }

        if (!targetApp.is_on_workspace(workspace))
            return;

        if (!this._targetIsCurrent) {
            this.actor.reactive = true;
            this._targetIsCurrent = true;

            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, { opacity: 255,
                                           time: Overview.ANIMATION_TIME,
                                           transition: 'easeOutQuad' });
        }

        if (targetApp == this._targetApp) {
            if (targetApp && targetApp.get_state() != Shell.AppState.STARTING) {
                this.stopAnimation();
                this._maybeSetMenu();
            }
            return;
        }

        this._spinner.actor.hide();
        if (this._iconBox.child != null)
            this._iconBox.child.destroy();
        this._iconBox.hide();
        this._label.setText('');

        if (this._appMenuNotifyId)
            this._targetApp.disconnect(this._appMenuNotifyId);
        if (this._actionGroupNotifyId)
            this._targetApp.disconnect(this._actionGroupNotifyId);
        if (targetApp) {
            this._appMenuNotifyId = targetApp.connect('notify::menu', Lang.bind(this, this._sync));
            this._actionGroupNotifyId = targetApp.connect('notify::action-group', Lang.bind(this, this._sync));
        } else {
            this._appMenuNotifyId = 0;
            this._actionGroupNotifyId = 0;
        }

        this._targetApp = targetApp;
        let icon = targetApp.get_faded_icon(2 * Panel.PANEL_ICON_SIZE);

        this._label.setText(targetApp.get_name());
        this.setName(targetApp.get_name());

        this._iconBox.set_child(icon);
        this._iconBox.show();

        if (targetApp.get_state() == Shell.AppState.STARTING)
            this.startAnimation();
        else
            this._maybeSetMenu();

        this.emit('changed');
    }
});



function init() {
    /*do nothing*/
}

function enable() {
	log("Loading Extra Panels");
    let eP = new ExtraPanels();
	Main.__eP = eP;
	Main.panel._appMenus = [];

	for (let i = 0; i < eP.monitors.length; i++) {	
			let panel;	
            
			if (i == eP.primaryIndex) {
				panel = Main.panel;
			} else {
				panel = Main.__eP.panels[i];
			}
			let left_children = panel._leftBox.get_children();
			left_children.forEach(function(lchild){
				if (lchild._delegate instanceof Panel.AppMenuButton){
						lchild.destroy();
				}
			});

			Main.panel._appMenus[i] = new NewAppMenuButton(i);
			panel._leftBox.add(Main.panel._appMenus[i].actor)
	}
}

function disable() {
	//dsetroy extra panels
	Main.__eP.destroy();
	//replace on primary with original appMenu
	let left_children = Main.panel._leftBox.get_children();
	left_children.forEach(function(lchild){
		if (lchild._delegate instanceof NewAppMenuButton)
			lchild.destroy();
	});
	Main.panel._appMenu = new Panel.AppMenuButton(Main.panel._menus);
	Main.panel._leftBox.add(Main.panel._appMenu.actor);
	Main.panel._appMenus = null;
	Main.__eP = null;

}