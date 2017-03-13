import {Component, EventEmitter} from "@angular/core";
import {BoardData} from "../../../data/board/boardData";
import {IssueData} from "../../../data/board/issueData";
import {IssuesService} from "../../../services/issuesService";
import {ProgressErrorService} from "../../../services/progressErrorService";
import {Hideable} from "../../../common/hide";
import {IssueContextMenuData} from "../../../data/board/issueContextMenuData";
import {VIEW_RANK} from "../../../common/constants";
import {BoardProject} from "../../../data/board/project";
import {FormGroup, FormControl, Validators} from "@angular/forms";

@Component({
    inputs: ['issueContextMenuData', 'view'],
    outputs: ['closeContextMenu'],
    selector: 'issue-context-menu',
    templateUrl: './issueContextMenu.html',
    styleUrls: ['./issueContextMenu.css']
})
export class IssueContextMenuComponent implements Hideable {
    private _issueContextMenuData:IssueContextMenuData;
    private _view:string;
    private showContext:boolean = false;
    private issue:IssueData;
    private toState:string;
    private canRank:boolean;

    //The name of the panel to show (they are 'move', 'comment', 'rank')
    private showPanel:string;

    private contextMenuPosition:Object;

    //Calculated dimensions
    private movePanelTop:string;
    private movePanelHeight:string;
    private movePanelLeft:string;
    private statesColumnHeight:string;


    private commentForm:FormGroup;
    private commentPanelLeft:string;

    private rankPanelTop:string;
    private rankPanelLeft:string;
    private rankPanelHeight:string;
    private rankedIssuesColumnHeight:string;
    private rankedIssues:IssueData[];
    private rankBeforeKey:string;

    private closeContextMenu:EventEmitter<any> = new EventEmitter();

    constructor(private _boardData:BoardData, private _issuesService:IssuesService,
                private _progressError:ProgressErrorService) {
        _boardData.registerHideable(this);
    }

    private set issueContextMenuData(data:IssueContextMenuData) {
        this.showContext = !!data;
        this.showPanel = null;
        this.toState = null;
        this.issue = null;
        this._issueContextMenuData = data;
        this.issue = null;
        this.rankedIssues = null;
        this.issue = this._boardData.getIssue(data.issueKey);
        this.toState = this.issue.boardStatus;
        this.canRank = this._boardData.canRank(this.issue.projectCode);
        this.setWindowSize();
    }

    set view(value: string) {
        this._view = value;
    }

    hide():void {
        this.hideAllMenus();
    }

    private hideAllMenus() {
        this.showContext = false;
        this.showPanel = null;
        this.commentForm = null;
        this.rankedIssues = null;
    }

    private get issueContextMenuData() {
        return this._issueContextMenuData;
    }

    private showRankMenuEntry() {
        return this.canRank && this._view === VIEW_RANK;
    }

    private get displayContextMenu() : boolean {
        return !!this._issueContextMenuData && !!this.issue && this.showContext;
    }

    private get moveStates() : string[] {
        return this._boardData.boardStateNames;
    }

    private isValidMoveState(state:string) : boolean {
        //We can do a plain move to all states apart from ourselves
        return this._boardData.isValidStateForProject(this.issue.projectCode, state) && state != this.issue.boardStatus;
    }

    private onShowMovePanel(event:MouseEvent) {
        console.log("on show move panel");
        event.preventDefault();
        this.hideAllMenus();
        this.showPanel = "move";
    }

    private onSelectMoveState(event:MouseEvent, toState:string) {
        //The user has selected to move to a state accepting the default ranking
        event.preventDefault();
        this.toState = toState;

        //Tell the server to move the issue. The actual move will come in via the board's polling mechanism.
        this._progressError.startProgress(true);
        this._issuesService.moveIssue(this._boardData, this.issue, this.toState)
            .subscribe(
                data => {},
                error => {
                    this._progressError.setError(error);
                    this.hideAllMenus();
                },
                () => {
                    let status:string = "<a " +
                    "class='toolbar-message' href='" + this._boardData.jiraUrl + "/browse/" + this.issue.key + "'>" +
                        this.issue.key + "</a> moved to '" + this.toState + "'";
                    this._progressError.finishProgress(status);
                    this.hideAllMenus();
                }
            );
    }


    private onShowCommentPanel(event:MouseEvent) {
        event.preventDefault();
        this.hideAllMenus();
        this.showPanel = "comment";
        this.commentForm = new FormGroup({
            "comment": new FormControl("", Validators.required)
        });
    }

    private saveComment() {
        let comment:string = this.commentForm.value.comment;
        this._progressError.startProgress(true);
        this._issuesService.commentOnIssue(this._boardData, this.issue, comment)
            .subscribe(
                data => {
                    //No data is returned, issuesService refreshes boardData for us
                    this.hideAllMenus();
                },
                err => {
                    this._progressError.setError(err);
                },
                () => {
                    this._progressError.finishProgress(
                        "Comment made on issue <a " +
                        "class='toolbar-message' href='" + this._boardData.jiraUrl + "/browse/" + this.issue.key + "'>" +
                        this.issue.key + "</a>");
                }
            );

    }

    private onShowRankPanel(event:MouseEvent) {
        event.preventDefault();
        this.hideAllMenus();
        this.showPanel = "rank";
        this.rankBeforeKey = this.issue.key;
    }

    get rankedIssuesForIssueProject():IssueData[] {
        if (!this.rankedIssues) {
            let project:BoardProject = this._boardData.boardProjects.forKey(this.issue.projectCode);
            this.rankedIssues = [];
            for (let key of project.rankedIssueKeys) {
                this.rankedIssues.push(this._boardData.getIssue(key));
            }
        }
        return this.rankedIssues;
    }

    isIssueBeingRanked(issue:IssueData) {
        return this.issue.key === issue.key;
    }

    onClickRankBefore(event:MouseEvent, index:number) {
        event.preventDefault();
        let before:IssueData;
        let beforeKey:string;
        let afterKey:string;
        if (index >= 0) {
            before = this.rankedIssuesForIssueProject[index];
            this.rankBeforeKey = before.key;
            beforeKey = before.key;
            if (index > 0) {
                afterKey = this.rankedIssuesForIssueProject[index - 1].key;
            }

        } else {
            this.rankBeforeKey = null;
            afterKey = this.rankedIssuesForIssueProject[this.rankedIssuesForIssueProject.length - 1].key;
        }
        console.log("onClickRankBefore " + index + "; before: " + beforeKey + " ; after: " + afterKey);
        this._progressError.startProgress(true);
        this._issuesService.performRerank(this.issue, beforeKey, afterKey)
            .subscribe(
                data => {
                    //No data is returned, issuesService refreshes boardData for us
                    this.hideAllMenus();
                },
                err => {
                    this._progressError.setError(err);
                },
                () => {
                    let msg = "Ranked <a " +
                        "class='toolbar-message' href='" + this._boardData.jiraUrl + "/browse/" + this.issue.key + "'>" +
                        this.issue.key + "</a> ";
                    if (index < 0) {
                        msg += " to the end";
                    } else {
                        msg += " before " + beforeKey;
                    }
                    this._progressError.finishProgress(msg);
                }
            );
    }


    private onResize(event : any) {
        this.setWindowSize();
    }

    private setWindowSize() {

        this.contextMenuPosition = new Object();
        if (this._issueContextMenuData.x > 100) {
            this.contextMenuPosition["right"] = (window.innerWidth - this._issueContextMenuData.x).toString() + "px";
        } else {
            this.contextMenuPosition["left"] = this.issueContextMenuData.x.toString() + "px";
        }
        if (this._issueContextMenuData.y < window.innerHeight - 100) {
            this.contextMenuPosition["top"] = this._issueContextMenuData.y.toString() + "px";
        } else {
            this.contextMenuPosition["bottom"] = (window.innerHeight - this._issueContextMenuData.y).toString() + "px";
        }
        console.log(JSON.stringify(this.contextMenuPosition));

        let movePanelTop:number, movePanelHeight:number, movePanelLeft:number, statesColumnHeight:number;
        let movePanelWidth:number = 410;

        //40px top and bottom padding if window is high enough, 5px otherwise
        let yPad = window.innerHeight > 350 ? 40 : 5;
        movePanelHeight = window.innerHeight - 2 * yPad;
        movePanelTop = window.innerHeight/2 - movePanelHeight/2;
        statesColumnHeight = movePanelHeight - 55;

        //css hardcodes the width as 410px;
        if (window.innerWidth > movePanelWidth) {
            movePanelLeft = window.innerWidth/2 - movePanelWidth/2;
        }
        this.movePanelTop = movePanelTop + "px";
        this.movePanelHeight = movePanelHeight + "px";
        this.movePanelLeft = movePanelLeft + "px";
        this.statesColumnHeight = statesColumnHeight + "px";

        let commentPanelLeft:number = (window.innerWidth - 600)/2;
        this.commentPanelLeft = commentPanelLeft + "px";

        this.rankPanelTop = movePanelTop + "px";
        this.rankPanelHeight = movePanelHeight + "px";
        let rankPanelLeft:number = (window.innerWidth - 500)/2;
        this.rankPanelLeft = rankPanelLeft + "px";
        this.rankedIssuesColumnHeight = statesColumnHeight + "px";
    }

    private onClickClose(event:MouseEvent) {
        this.hideAllMenus();
        this.closeContextMenu.emit({});
        event.preventDefault();
    }

    get boardData():BoardData {
        return this._boardData;
    }
}

