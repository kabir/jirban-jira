import {IssueData} from "./issueData";
import {BoardData} from "./boardData";
import {IMap} from "../../common/map";
import {Observable, Subject, Subscription} from "rxjs";

export class SwimlaneData {
    private readonly _name:string;
    //TODO make this immutable at some stage
    public readonly _issueTable:IssueData[][];
    private _collapsed:boolean = false;
    public filtered:boolean;
    private readonly _index:number;
    private readonly _empty:boolean;
    private _visibleIssueCount:number;

    constructor(params:SwimlaneDataConstructorParams) {
        this._name = params.name;
        this._index = params.index;
        this._issueTable = params.issueTable;
        this._empty = params.empty;
        this._visibleIssueCount = params.visibleIssueCount;
    }

    toggleCollapsedStatus() : void {
        this._collapsed = !this._collapsed;
    }

    get collapsed():boolean {
        return this._collapsed;
    }

    set collapsed(collapsed:boolean) {
        this._collapsed = collapsed;
    }

    get name() {
        return this._name;
    }

    get index() {
        return this._index;
    }

    get issueTable() : IssueData[][] {
        return this._issueTable;
    }

    get empty(): boolean {
        return this._empty || this._visibleIssueCount == 0;
    }

    restoreCollapsedStatus(savedVisibilities:IMap<boolean>) {
        //When restoring the visibility, take into account that new swimlanes would not have been saved,
        //and so do not appear in the map
        this._collapsed = (savedVisibilities[this._name] == true);
    }

    initializeVisibiltySubscriptions(ngUnsubscribe:Observable<void>) {
        for (let issuesForState of this._issueTable) {
            for (let issue of issuesForState) {
                issue.filteredObservable
                    .takeUntil(ngUnsubscribe)
                    .subscribe(filtered => filtered ? this._visibleIssueCount-- : this._visibleIssueCount++);
            }
        }
    }
}

export class SwimlaneDataBuilder {
    private _name:string;
    private _issueTable:IssueData[][];
    private _index:number;
    private _totalIssueCount:number = 0;
    private _visibleIssueCount:number = 0;
    private _subscriptions:Subscription[] = [];

    constructor(boardData:BoardData, name:string, index:number) {
        this._name = name;
        this._index = index;
        let states = boardData.boardStateNames.length;
        this._issueTable = new Array<IssueData[]>(states);
        for (let i:number = 0 ; i < states ; i++) {
            this._issueTable[i] = [];
        }
    }

    get name() {
        return this._name;
    }

    get index() {
        return this._index;
    }

    addIssue(index:number, issueData:IssueData) {
        this._issueTable[index].push(issueData);
        this._totalIssueCount++;
        if (!issueData.filtered) {
            this._visibleIssueCount++;
        }
    }

    build() : SwimlaneData {
        return new SwimlaneData(new SwimlaneDataConstructorParams(this._name, this._issueTable, this._index, this._totalIssueCount == 0, this._visibleIssueCount));
    }
}

//Use this 'hidden' intermediate class to ensure we can only create SwimlaneData from the builder
class SwimlaneDataConstructorParams {
    constructor(public name:string, public issueTable:IssueData[][], public index:number, public empty:boolean, public visibleIssueCount:number) {
    }
}