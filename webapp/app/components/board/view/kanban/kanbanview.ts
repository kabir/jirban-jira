import {Component} from "@angular/core";
import {BoardData} from "../../../../data/board/boardData";
import {AppHeaderService} from "../../../../services/appHeaderService";
import {BoardHeaderEntry, State} from "../../../../data/board/header";
import {CharArrayRegistry} from "../../../../common/charArrayRegistry";
import {FixedHeaderView} from "../fixedHeaderView";
import {IssuesService} from "../../../../services/issuesService";
import {AbbreviatedHeaderRegistry} from "../../../../common/abbreviatedStateNameRegistry";
import {ProgressErrorService} from "../../../../services/progressErrorService";
import {IssueData} from "../../../../data/board/issueData";


@Component({
    selector: 'kanban-view',
    inputs: ["boardCode", "issuesService", "boardData", "abbreviatedHeaderRegistry"],
    outputs: ["showIssueContextMenu", "showParallelTaskMenu"],
    templateUrl: './kanbanview.html',
    styleUrls: ['./kanbanview.css']
})
export class KanbanViewComponent extends FixedHeaderView {

    /** Cache all the char arrays used for the collapsed column labels so they are not recalculated all the time */
    private _collapsedColumnLabels:CharArrayRegistry = new CharArrayRegistry();

    constructor(appHeaderService:AppHeaderService,
                issuesService:IssuesService,
                private _progressError:ProgressErrorService) {
        super(appHeaderService, issuesService, "Kanban");
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

    private get visibleColumns():boolean[] {
        return this._boardData.headers.stateVisibilities;
    }

    private getCharArray(state:string):string[] {
        return this._collapsedColumnLabels.getCharArray(state);
    }

    get backlogBottomHeadersIfVisible():BoardHeaderEntry[] {
        if (this.backlogTopHeader && this.backlogTopHeader.visible) {
            return this._boardData.headers.backlogBottomHeaders;
        }
        return null;
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


    toggleHeaderVisibility(header:BoardHeaderEntry) {
        let previousBacklog:boolean = this.boardData.showBacklog;

        this._boardData.headers.toggleHeaderVisibility(header);

        if (this.boardData.showBacklog != previousBacklog) {
            this._issuesService.toggleBacklog();
        }
    }

    getTopLevelHeaderClass(header:BoardHeaderEntry):string {
        if (header.stateAndCategory) {
            if (header.visible) {
                return 'visible';
            } else {
                return 'collapsed';
            }
        }
        return '';
    }

    private onDragOver(event:DragEvent, state:string) {
        event.preventDefault();
    }

    private onDrop(event:DragEvent, toState:string) {
        if (!event.dataTransfer) {
            return;
        }
        let key:string = event.dataTransfer.getData("issue-key");
        if (!key) {
            return;
        }
        let issue:IssueData = this._boardData.getIssue(key);

        //Tell the server to move the issue. The actual move will come in via the board's polling mechanism.
        this._progressError.startProgress(true);
        this._issuesService.moveIssue(this._boardData, issue, toState)
            .subscribe(
                data => {},
                error => {
                    this._progressError.setError(error);
                },
                () => {
                    let status:string = "<a " +
                        "class='toolbar-message' href='" + this._boardData.jiraUrl + "/browse/" + issue.key + "'>" +
                        issue.key + "</a> moved to '" + toState + "'";
                    this._progressError.finishProgress(status);
                }
            );
    }
}



