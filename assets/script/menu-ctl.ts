import { _decorator, Component, director, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('menu_ctl')
export class menu_ctl extends Component {

    @property({type: Node})
    public mainMenu: Node = null!;
    @property({type: Node})
    public settingPanel: Node = null!;
    @property({type: Node})
    public chapterPanel: Node = null!;

    start() {
    }

    update(deltaTime: number) {
    }

    onStartClicked () {
        director.loadScene(
            'free-travel',
            ()=>{}, ()=>{}
        );
    }

    onContinueClicked () {
        director.loadScene(
            'free-travel',
            ()=>{}, ()=>{}
        );
    }

    onChapterClicked () {
        console.log(`Chapter`);
        this.mainMenu.active = false;
        this.chapterPanel.active = true;
    }

    onChapterClosed () {
        console.log(`Chapter Closed`);
        this.chapterPanel.active = false;
        this.mainMenu.active = true;
    }

    onSettingsClicked () {
        this.mainMenu.active = false;
        this.settingPanel.active = true;
        console.log(`Settings`);
    }

    onSettingsClosed () {
        this.settingPanel.active = false;
        this.mainMenu.active = true;
        console.log(`Settings Closed`);
    }
}