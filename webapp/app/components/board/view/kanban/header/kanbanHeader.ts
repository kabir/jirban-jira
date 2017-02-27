import {Component, EventEmitter} from "@angular/core";
import {BoardData} from "../../../../../data/board/boardData";
import {BoardHeaderEntry, State} from "../../../../../data/board/header";
import {IndexedColourUtil} from "../../../../../common/colourUtil";
import {AbbreviatedHeaderRegistry} from "../../../../../common/abbreviatedStateNameRegistry";


@Component({
    selector: 'kanban-header',
    inputs: ["boardData", "boardLeftOffsetPx", "abbreviatedHeaderRegistry"],
    outputs: ["toggleHeaderEvent"],
    templateUrl: './kanbanHeader.html',
    styleUrls: ['./kanbanHeader.css']
    //TODO OnPush
})
export class KanbanViewHeaderComponent {

    private _boardData:BoardData;
    private _boardLeftOffsetPx:string = "0px";
    private _abbreviatedHeaderRegistry:AbbreviatedHeaderRegistry;
    private toggleHeaderEvent:EventEmitter<BoardHeaderEntry> = new EventEmitter<BoardHeaderEntry>();

    constructor() {
    }

    set boardData(value:BoardData) {
        this._boardData = value;
    }

    set boardLeftOffsetPx(value: string) {
        this._boardLeftOffsetPx = value;
    }

    get boardLeftOffsetPx(): string {
        return this._boardLeftOffsetPx;
    }

    set abbreviatedHeaderRegistry(value:AbbreviatedHeaderRegistry) {
        this._abbreviatedHeaderRegistry = value;
    }

    private get visibleColumns():boolean[] {
        return this._boardData.headers.stateVisibilities;
    }

    getColourForIndex(index:number) : string {
        return IndexedColourUtil.forIndex(index);
    }

    get backlogBottomHeadersIfVisible():BoardHeaderEntry[] {
        if (this.backlogTopHeader && this.backlogTopHeader.visible) {
            return this._boardData.headers.backlogBottomHeaders;
        }
        return null;
    }

    get topHeaders():BoardHeaderEntry[] {
        return this._boardData.headers.topHeaders;
    }

    get bottomHeaders():BoardHeaderEntry[] {
        return this._boardData.headers.bottomHeaders;
    }

    get backlogTopHeader():BoardHeaderEntry {
        return this._boardData.headers.backlogTopHeader;
    }

    get mainStates():State[] {
        return this._boardData.mainStates;
    }

    get backlogAndIsCollapsed():boolean {
        if (!this.backlogTopHeader) {
            return false;
        }
        return !this.backlogTopHeader.visible;
    }

    get backlogStatesIfVisible():State[] {
        if (this.backlogTopHeader && this.backlogTopHeader.visible) {
            return this._boardData.backlogStates;
        }
        return null;
    }

    getPossibleStateHelp(header:BoardHeaderEntry):string {
        if (header.rows == 2) {
            return this.getStateHelp(header);
        }
        return null;
    }

    getStateHelp(header:BoardHeaderEntry):string {
        return this._boardData.helpTexts[header.name];
    }


    getAbbreviatedHeader(state:string):string {
        return this._abbreviatedHeaderRegistry.getAbbreviatedHeader(state);
    }

    onToggleHeaderVisibility(header:BoardHeaderEntry) {
        this.toggleHeaderEvent.emit(header);
    }
}



