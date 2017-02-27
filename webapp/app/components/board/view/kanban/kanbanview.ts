import {Component} from "@angular/core";
import {BoardData} from "../../../../data/board/boardData";
import {AppHeaderService} from "../../../../services/appHeaderService";
import {BoardHeaderEntry, State} from "../../../../data/board/header";
import {FixedHeaderView} from "../fixedHeaderView";
import {IssuesService} from "../../../../services/issuesService";
import {AbbreviatedHeaderRegistry} from "../../../../common/abbreviatedStateNameRegistry";


@Component({
    selector: 'kanban-view',
    inputs: ["boardCode", "issuesService", "boardData", "abbreviatedHeaderRegistry"],
    outputs: ["showIssueContextMenu", "showParallelTaskMenu"],
    templateUrl: './kanbanview.html',
    styleUrls: ['./kanbanview.css']
})
export class KanbanViewComponent extends FixedHeaderView {

    constructor(_appHeaderService:AppHeaderService) {
        super(_appHeaderService, "Kanban");
    }

    set issuesService(value:IssuesService) {
        super.setIssuesService(value);
    }

    set boardCode(value:string) {
        super.setBoardCode(value);
    }

    set boardData(value:BoardData) {
        super.setBoardData(value);
    }

    get boardData():BoardData {
        return this._boardData;
    }

    set abbreviatedHeaderRegistry(value:AbbreviatedHeaderRegistry) {
        super.setAbbreviatedHeaderRegistry(value);
    }

    get abbreviatedHeaderRegistry(): AbbreviatedHeaderRegistry {
        return this._abbreviatedHeaderRegistry;
    }

    private get visibleColumns():boolean[] {
        return this._boardData.headers.stateVisibilities;
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

    onToggleHeaderVisibility(header:any) {
        let previousBacklog:boolean = this.boardData.showBacklog;

        this._boardData.headers.toggleHeaderVisibility(header);

        if (this.boardData.showBacklog != previousBacklog) {
            this._issuesService.toggleBacklog();
        }
    }
}



