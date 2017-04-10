import {Indexed} from "../../common/indexed";
import {IMap} from "../../common/map";
import {BoardData} from "./boardData";
import {Subject} from "rxjs/Subject";
import {Observable} from "rxjs/Observable";
/**
 * Support for categorised state headers
 */
export class BoardHeaders {

    private _boardData:BoardData;
    //TODO It would be nice to get rid of this and only use _boardStates here and everywhere that uses it
    private _boardStateNames:Indexed<string> = new Indexed<string>();

    private _boardStates:Indexed<State> = new Indexed<State>();
    private _backlogStates:State[] = [];
    private _mainStates:State[] = [];

    private _backlogTopHeader:BoardHeaderEntry;
    private _backlogBottomHeaders:BoardHeaderEntry[] = [];

    private _topHeaders:BoardHeaderEntry[] = [];
    private _bottomHeaders:BoardHeaderEntry[] = [];

    private _stateVisibilities:boolean[];
    private _stateVisibilitiesSubject:Subject<void> = new Subject<void>();

    private _showBacklog:boolean = false;

    constructor(boardData:BoardData,
                boardStateNames:Indexed<string>, boardStates:Indexed<State>,
                backlogStates:State[], mainStates:State[],
                backlogTopHeader:BoardHeaderEntry, backlogBottomHeaders:BoardHeaderEntry[],
                topHeaders:BoardHeaderEntry[], bottomHeaders:BoardHeaderEntry[],
                stateVisibilities:boolean[],
                stateVisibilitiesSubject:Subject<void>,
                showBacklog:boolean) {
        this._boardData = boardData;
        this._boardStateNames = boardStateNames;
        this._boardStates = boardStates;
        this._backlogStates = backlogStates;
        this._mainStates = mainStates;
        this._backlogTopHeader = backlogTopHeader;
        this._backlogBottomHeaders = backlogBottomHeaders;
        this._topHeaders = topHeaders;
        this._bottomHeaders = bottomHeaders;

        this._stateVisibilities = stateVisibilities;
        this._stateVisibilitiesSubject = stateVisibilitiesSubject;

        this._showBacklog = showBacklog;
    }

    static deserialize(boardData:BoardData, input:any):BoardHeaders {
        let backlogSize:number = input.backlog ? input.backlog : 0;
        let doneSize:number = input.done ? input.done : 0;

        let boardStateNames:Indexed<string> = new Indexed<string>();
        let boardStates:Indexed<State> = new Indexed<State>();
        let headers:string[] = input.headers;

        let categories:Indexed<StateCategory> = new Indexed<StateCategory>();
        let index = 0;
        for (let state of input.states) {
            boardStateNames.add(state.name, state.name);

            let backlogState:boolean = index < backlogSize;

            let category:StateCategory;
            if (!isNaN(state.header)) {
                let header:string = headers[state.header];
                category = BoardHeaders.getOrCreateStateCategory(categories, header, false);
            } else if (backlogState) {
                category = BoardHeaders.getOrCreateStateCategory(categories, "Backlog", true);
            }

            let doneState:boolean = index >= input.states.length - doneSize;
            let stateEntry = new State(boardData, state.name, boardStates.array.length, backlogState, doneState, category, state["wip"]);
            boardStates.add(state.name, stateEntry);
            if (category) {
                category.states.push(stateEntry);
            }
            index++;
        }

        let stateVisibilities:boolean[];
        let stateVisibilitiesSubject:Subject<void>;
        let showBacklog:boolean = false;
        if (boardData && boardData.headers) {
            //For a simple refresh following polling, use the same states
            stateVisibilities = boardData.headers._stateVisibilities;
            stateVisibilitiesSubject = boardData.headers._stateVisibilitiesSubject;
            showBacklog = boardData.headers.showBacklog;
        } else {
            stateVisibilities = new Array<boolean>(boardStates.array.length);
            for (let i:number = 0 ; i < stateVisibilities.length ; i++) {
                stateVisibilities[i] = !BoardHeaders.isHiddenBacklogState(boardData, backlogSize, i);
            }
            stateVisibilitiesSubject = new Subject<void>();
        }

        let backlogTopHeader:CategoryHeaderEntry;
        let backlogBottomHeaders:BoardHeaderEntry[] = [];
        let topHeaders:BoardHeaderEntry[] = [];
        let bottomHeaders:BoardHeaderEntry[] = [];
        let addedCategories:IMap<boolean> = {};
        let backlogStates:State[] = [];
        let mainStates:State[] = [];
        let doneStates:State[] =[];

        for (let i:number = 0 ; i < boardStates.array.length ; i++) {
            let indexedState:State = boardStates.array[i];
            if (!indexedState.category) {
                if (!indexedState.done) {
                    //The 'done' states should not be added to the headers
                    topHeaders.push(new StateHeaderEntry(indexedState, stateVisibilities, 1, 2));
                }
            } else {
                if (indexedState.backlog) {
                    if (!backlogTopHeader) {
                        backlogTopHeader = new CategoryHeaderEntry(indexedState.category, stateVisibilities, indexedState.category.states.length);
                    }
                    backlogBottomHeaders.push(new StateHeaderEntry(indexedState, stateVisibilities, 1, 1));
                } else {
                    if (!addedCategories[indexedState.category.name]) {
                        topHeaders.push(new CategoryHeaderEntry(indexedState.category, stateVisibilities, indexedState.category.states.length));
                        addedCategories[indexedState.category.name] = true;
                    }
                    bottomHeaders.push(new StateHeaderEntry(indexedState, stateVisibilities, 1, 1));
                }
            }

            if (i < backlogSize) {
                backlogStates.push(boardStates.array[i]);
            } else if (i >= boardStates.array.length - doneSize) {
                doneStates.push(boardStates.array[i]);
            } else {
                mainStates.push(boardStates.array[i]);
            }

        }

        if (backlogTopHeader && boardData && !boardData.headers && boardData.showBacklog) {
            //Force the backlog to be visible
            backlogTopHeader.forceVisible();
            showBacklog = true;
        }

        return new BoardHeaders(boardData, boardStateNames, boardStates,
            backlogStates, mainStates,
            backlogTopHeader, backlogBottomHeaders, topHeaders, bottomHeaders,
            stateVisibilities, stateVisibilitiesSubject, showBacklog);
    }

    get showBacklog():boolean {
        return this._showBacklog;
    }

    get backlogTopHeader():BoardHeaderEntry {
        return this._backlogTopHeader;
    }

    get backlogBottomHeaders():BoardHeaderEntry[] {
        return this._backlogBottomHeaders;
    }

    get topHeaders():BoardHeaderEntry[] {
        return this._topHeaders;
    }

    get bottomHeaders():BoardHeaderEntry[] {
        return this._bottomHeaders;
    }

    get boardStateNames():Indexed<string> {
        return this._boardStateNames;
    }

    get boardStates():Indexed<State> {
        return this._boardStates;
    }

    get mainStates():State[] {
        return this._mainStates;
    }

    get backlogStates():State[] {
        return this._backlogStates;
    }

    get stateVisibilities():boolean[] {
        return this._stateVisibilities;
    }

    get stateVisibilitiesChangedObservable():Observable<void> {
        return this._stateVisibilitiesSubject;
    }

    toggleHeaderVisibility(header:BoardHeaderEntry):void {
        header.toggleVisibility();
        if (header.backlog) {
            if (header.isCategory) {
                this._showBacklog = !this._showBacklog;
            } else {
                for (let i:number = 0 ; i < this._backlogStates.length ; i++) {
                    if (this._stateVisibilities[i] != this._showBacklog) {
                        this._showBacklog = !this._showBacklog;
                    }
                }
            }
        }
        this._stateVisibilitiesSubject.next(null);
    }

    private static getOrCreateStateCategory(categories:Indexed<StateCategory>, header:string, backlog:boolean):StateCategory {
        let category:StateCategory = categories.forKey(header);
        if (!category) {
            category = new StateCategory(header, backlog);
            categories.add(header, category);
        }
        return category;
    }

    createQueryStringParticle():string {
        let visible:string = "";
        let hidden:string = "";
        
        for (let i:number = 0 ; i < this._stateVisibilities.length ; i++) {
            if (this.isHiddenBacklogState(i)) {
                continue;
            }
            if (this._stateVisibilities[i]) {
                if (visible.length > 0) {
                    visible += ",";
                }
                visible += i;
            } else {
                if (hidden.length > 0) {
                    hidden += ",";
                }
                hidden += i;
            }
        }

        if (hidden.length == 0) {
            return "";
        }
        if (hidden.length < visible.length) {
            return "&hidden=" + hidden;
        } else {
            return "&visible=" + visible;
        }
    }

    setVisibilitiesFromQueryParams(queryParams:IMap<string>):void{
        let value:string;
        let visible:boolean = false;
        if (queryParams["hidden"]) {
            value = queryParams["hidden"];
        } else if (queryParams["visible"]) {
            value = queryParams["visible"];
            visible = true;
        }

        if (!value) {
            return;
        }

        if (visible) {
            for (let i:number = 0 ; i < this._stateVisibilities.length ; i++) {
                //Set everything to false to make the next loop easier
                if (this.isHiddenBacklogState(i)) {
                    continue;
                }
                this._stateVisibilities[i] = false;
            }
        }

        let values:string[] = value.split(",");
        for (let i:number = 0 ; i < values.length ; i++) {
            let index:number = Number(values[i]);
            if (this.isHiddenBacklogState(index)) {
                continue;
            }
            this._stateVisibilities[index] = visible;
        }
    }

    private isHiddenBacklogState(index:number):boolean {
        return BoardHeaders.isHiddenBacklogState(this._boardData, this._backlogStates.length, index);
    }

    private static isHiddenBacklogState(boardData:BoardData, backlogStatesLength:number, index:number):boolean {
        return !boardData.showBacklog && index < backlogStatesLength;
    }
}

class StateCategory {
    private _name:string;
    private _backlog:boolean;
    private _states:State[] = [];

    constructor(name:string, backlog:boolean) {
        this._name = name;
        this._backlog = backlog;
    }

    get name():string {
        return this._name;
    }

    get states():State[] {
        return this._states;
    }

    get totalIssues():number {
        let total:number = 0;
        for (let state of this._states) {
            total += state.totalIssues;
        }
        return total;
    }

    get visibleIssues():number {
        let visible:number = 0;
        for (let state of this._states) {
            visible += state.visibleIssues;
        }
        return visible;
    }

    get backlog():boolean {
        return this._backlog;
    }

    isVisible(stateVisibilities:boolean[]):boolean {
        for (let state of this._states) {
            if (state.isVisible(stateVisibilities)) {
                return true;
            }
        }
        return false;
    }

    toggleVisibility(stateVisibilities:boolean[]) {
        //We set all the state visibilities to false. However, if they were all false, we set them all to true.
        let visible:boolean = false;
        for (let state of this._states) {
            let visibility:boolean = stateVisibilities[state.index];
            if (visibility) {
                visible = true;
            }
            stateVisibilities[state.index] = false;
        }

        if (!visible) {
            for (let state of this._states) {
                stateVisibilities[state.index] = true;
            }
        }
    }

    forceVisible(stateVisibilities:boolean[]) {
        for (let state of this._states) {
            stateVisibilities[state.index] = true;
        }
    }
}

export class State {

    constructor(private _boardData:BoardData, private _name:string, private _index:number,
                private _backlog:boolean, private _done:boolean, private _category:StateCategory,
                private _wip:number) {
        //console.log(_index);
    }

    get name():string {
        return this._name;
    }

    get category():StateCategory {
        return this._category;
    }

    get totalIssues():number {
        return this._boardData.totalIssuesByState[this._index];
    }

    get visibleIssues():number {
        return this._boardData.visibleIssuesByState[this._index];
    }

    get index():number {
        return this._index;
    }

    get backlog():boolean {
        return this._backlog;
    }

    get done():boolean {
        return this._done;
    }

    get wip() {
        return this._wip;
    }

    get exceedWip():boolean {
        if (!this._wip) {
            return false;
        }
        if (this.totalIssues > this._wip) {
            console.log("Exceeded wip for " + this._name);
        }
        return this.totalIssues > this._wip;
    }

    isVisible(stateVisibilities:boolean[]):boolean{
        return stateVisibilities[this._index];
    }

    toggleVisibility(stateVisibilities:boolean[]) {
        stateVisibilities[this._index] = !stateVisibilities[this._index];
    }
}

export abstract class BoardHeaderEntry {
    protected _stateVisibilities:boolean[];
    private _cols:number;
    protected _rows:number;

    constructor(stateVisibilities:boolean[], cols:number, rows:number) {
        this._stateVisibilities = stateVisibilities;
        this._cols = cols;
        this._rows = rows;
    }

    get cols():number {
        return this._cols;
    }

    get rows():number {
        return this._rows;
    }

    get stateAndCategory():boolean {
        //Abstract getters don't exist :(
        throw new Error("nyi");
    }

    get name():string {
        //Abstract getters don't exist :(
        throw new Error("nyi");
    }

    get totalIssues():number {
        //Abstract getters don't exist :(
        throw new Error("nyi");
    }

    get visible():boolean {
        //Abstract getters don't exist :(
        throw new Error("nyi");
    }

    get isCategory():boolean {
        //Abstract getters don't exist :(
        throw new Error("nyi");
    }

    get backlog():boolean {
        //Abstract getters don't exist :(
        throw new Error("nyi");
    }

    get wip():number {
        //Abstract getters don't exist :(
        throw new Error("nyi");
    }

    get exceedWip():boolean {
        //Abstract getters don't exist :(
        throw new Error("nyi");
    }

    /** Do not call directly, use BoardHeaders.toggleHeaderVisibility() */
    abstract toggleVisibility():void;
}

class CategoryHeaderEntry extends BoardHeaderEntry {
    constructor(private _category:StateCategory, stateVisibilities:boolean[], cols:number) {
        //A header entry is always just one row
        super(stateVisibilities, cols, 1);
    }

    get name():string {
        return this._category.name;
    }

    get totalIssues() : number {
        return this._category.totalIssues;
    }

    get stateAndCategory():boolean {
        return false;
    }

    get visible():boolean {
        return this._category.isVisible(this._stateVisibilities);
    }

    get backlog():boolean{
        return this._category.backlog;
    }

    /** Do not call directly, use BoardHeaders.toggleHeaderVisibility() */
    toggleVisibility() {
        this._category.toggleVisibility(this._stateVisibilities);
    }

    get isCategory():boolean {
        return true;
    }

    get wip():number {
        return null;
    }

    get exceedWip():boolean {
        return false;
    }

    forceVisible() {
        this._category.forceVisible(this._stateVisibilities);
    }
}

class StateHeaderEntry extends BoardHeaderEntry {
    constructor(private _state:State, stateVisibilities:boolean[], cols:number, rows:number) {
        super(stateVisibilities, cols, rows);
    }

    get name():string {
        return this._state.name;
    }

    get totalIssues() : number {
        return this._state.totalIssues;
    }

    get stateAndCategory():boolean {
        return this._rows == 2;
    }

    get visible():boolean {
        return this._state.isVisible(this._stateVisibilities);
    }

    get backlog():boolean{
        return this._state.backlog;
    }

    /** Do not call directly, use BoardHeaders.toggleHeaderVisibility() */
    toggleVisibility() {
        this._state.toggleVisibility(this._stateVisibilities);
    }

    get isCategory():boolean {
        return false;
    }

    get wip():number {
        return this._state.wip;
    }

    get exceedWip():boolean {
        return this._state.exceedWip;
    }
}

export class IssueCounts {
    private readonly _total:number;
    private readonly _visible:number;

    constructor(total:number, visible:number) {
        this._total = total;
        this._visible = visible;
    }

    get total() : number {
        return this._total;
    }


    get visible() : number {
        return this._visible;
    }

    get hasFiltered() : boolean {
        return this._visible != this._total;
    }
}