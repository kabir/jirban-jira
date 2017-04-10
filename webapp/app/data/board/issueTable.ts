import {Projects, BoardProject} from "./project";
import {BoardData} from "./boardData";
import {IssueData} from "./issueData";
import {IMap} from "../../common/map";
import {BoardFilters} from "./boardFilters";
import {SwimlaneIndexer, SwimlaneIndexerFactory} from "./swimlaneIndexer";
import {Indexed} from "../../common/indexed";
import {ChangeSet, RankChange} from "./change";
import {Subject, Observable} from "rxjs/Rx";
import {SwimlaneData, SwimlaneDataBuilder} from "./swimlaneData";

export class IssueTable {
    private _allIssues:Indexed<IssueData>;
    private _issueTable:IssueData[][];
    private _swimlaneTable:SwimlaneData[];
    private _visibleIssuesByState:number[];
    private _totalIssuesByState:number[];
    private _rankedIssues:IssueData[] = [];

    private _swimlaneVisibitilySubject:Subject<void> = new Subject<void>();

    /**
     * Called when first loading a board
     * @param _boardData
     * @param _projects
     * @param _filters
     * @param _swimlane
     * @param input
     */
    constructor(
                private _boardData:BoardData,
                private _projects:Projects,
                private _filters:BoardFilters,
                private _swimlane:string,
                input:any) {
        this.internalFullRefresh(input, true);
    }

    /**
     * Called when we receive the full table over the web socket
     * @param input
     */
    fullRefresh(projects:Projects, input:any) {
        this._projects = projects;
        this.internalFullRefresh(input, false);
    }

    get issueTable():IssueData[][] {
        return this._issueTable;
    }

    get swimlaneTable():SwimlaneData[] {
        return this._swimlaneTable;
    }

    get totalIssuesByState() : number[] {
        return this._totalIssuesByState;
    }

    get visibleIssuesByState() : number [] {
        return this._visibleIssuesByState;
    }

    set filters(filters:BoardFilters) {
        this._filters = filters;

        for (let issue of this._allIssues.array) {
            issue.filterIssue(this._filters);
        }

        if (this._swimlane) {
            let indexer:SwimlaneIndexer = this.createSwimlaneIndexer();
            for (let swimlaneData of this._swimlaneTable) {
                swimlaneData.filtered = indexer.filter(swimlaneData);
            }
        }
    }

    set swimlane(swimlane:string) {
        this._swimlane = swimlane;
        this.createTable(false);
        this._swimlaneVisibitilySubject.next(null);
    }

    get swimlaneVisibilityObservable():Observable<void> {
        return this._swimlaneVisibitilySubject;
    }

    get rankedIssues(): IssueData[] {
        return this._rankedIssues;
    }

    toggleSwimlaneCollapsedStatus(swimlaneIndex:number) {
        if (this._swimlaneTable) {
            this._swimlaneTable[swimlaneIndex].toggleCollapsedStatus();
        }
        this._swimlaneVisibitilySubject.next(null);
    }

    getIssue(issueKey:string) : IssueData {
        return this._allIssues.forKey(issueKey);
    }

    processTableChanges(boardData:BoardData, changeSet:ChangeSet) {
        let storedSwimlaneVisibilities:IMap<boolean> = this.storeSwimlaneCollapsedStatus(false);

        //Delete from the "all issues table"
        let deletedIssues:IssueData[] = this._allIssues.deleteKeys(changeSet.deletedIssueKeys);

        if (changeSet.issueUpdates) {
            for (let update of changeSet.issueUpdates) {
                let issue = this._allIssues.forKey(update.key);
                if (!issue) {
                    console.log("Could not find issue to update " + update.key);
                    continue;
                }
            }
        }

        //Delete all the deleted issues from the project issue tables
        //This also includes all the issues that have been moved
        this._projects.deleteIssues(deletedIssues);



        //Now do the actual application of the updates
        if (changeSet.issueUpdates) {
            for (let update of changeSet.issueUpdates) {
                let issueIndex = this._allIssues.indexOf(update.key);
                let issue = this._allIssues.array[issueIndex];
                if (!issue) {
                    console.log("Could not find issue to update " + update.key);
                    continue;
                }
                let newIssue:IssueData = issue.applyUpdate(update);
                newIssue.filterIssue(this._filters);
                this._allIssues.array[issueIndex] = newIssue;
            }
        }
        //Add all the created issues
        if (changeSet.issueAdds) {
            for (let add of changeSet.issueAdds) {
                let issue:IssueData = IssueData.createFromChangeSet(boardData, add);
                this._allIssues.add(issue.key, issue);
                issue.filterIssue(this._filters);
            }
        }

        //Now update the issue ranks
        if (changeSet.rankChanges) {
            //let ownerProject:BoardProject = this._projects.ownerProject;
            for (let projectCode in changeSet.rankChanges) {

                let projectRankChanges:RankChange[] = changeSet.rankChanges[projectCode];
                if (projectRankChanges && projectRankChanges.length > 0) {
                    let project: BoardProject = this._projects.boardProjects.forKey(projectCode);
                    project.updateIssueRanks(changeSet.rankedIssues, changeSet.rankChanges[projectCode]);
                }
            }
        }

        this.createTable(false);
        this.restoreSwimlaneCollapsedStatus(storedSwimlaneVisibilities);
    }

    private internalFullRefresh(input:any, initial:boolean) {
        let storedSwimlaneVisibilities:IMap<boolean> = this.storeSwimlaneCollapsedStatus(initial);

        this._allIssues = new Indexed<IssueData>();
        this._allIssues.indexMap(
            input.issues,
            (key, data) => {
                return IssueData.createFullRefresh(this._boardData, data);
            });
        this.createTable(!initial);

        this.restoreSwimlaneCollapsedStatus(storedSwimlaneVisibilities);
    }

    private storeSwimlaneCollapsedStatus(initial:boolean) : IMap<boolean> {
        let swimlaneVisibilities:IMap<boolean>;
        if (!initial && this._swimlane && this._swimlaneTable) {
            //Store the visibilities from the users collapsing swimlanes
            swimlaneVisibilities = {};
            for (let swimlane of this._swimlaneTable) {
                swimlaneVisibilities[swimlane.name] = swimlane.collapsed;
            }
        }
        return swimlaneVisibilities;
    }

    private restoreSwimlaneCollapsedStatus(storedSwimlaneVisibilities:IMap<boolean>) {
        if (storedSwimlaneVisibilities) {
            //Restore the user defined visibilities
            for (let swimlane of this._swimlaneTable) {
                swimlane.restoreCollapsedStatus(storedSwimlaneVisibilities);
            }
        }
    }

    private createTable(filterIssues:boolean) {
        if (this._swimlane) {
            this._swimlaneTable = this.createSwimlaneTable(filterIssues);
            this._issueTable = null;
        } else {
            this._issueTable = this.createIssueTable(filterIssues);
            this._swimlaneTable = null;
        }
    }


    private createIssueTable(filterIssues:boolean) : IssueData[][] {
        let numStates = this._boardData.boardStateNames.length;

        this._totalIssuesByState = new Array<number>(numStates);
        this._visibleIssuesByState = new Array<number>(numStates);
        this._rankedIssues = [];

        let issueCounters = new Array<StateIssueCounter>(numStates);
        let issueTable:IssueData[][] = new Array<IssueData[]>(numStates);

        //Initialise the states
        for (let stateIndex:number = 0 ; stateIndex < numStates ; stateIndex++) {
            issueTable[stateIndex] = [];
            issueCounters[stateIndex] = new StateIssueCounter();
        }

        for (let boardProject of this._boardData.boardProjects.array) {
            for (let issueKey of boardProject.rankedIssueKeys) {
                let issue:IssueData = this._allIssues.forKey(issueKey);
                let boardStateIndex:number = boardProject.mapStateIndexToBoardIndex(issue.statusIndex);

                let issuesForState:IssueData[] = issueTable[boardStateIndex];
                issuesForState.push(issue);

                let issueCounter:StateIssueCounter = issueCounters[boardStateIndex];
                issueCounter.incrementTotal();
                if (filterIssues) {
                    issue.filterIssue(this._filters);
                    if (issue.filtered) {
                        issueCounter.incrementFiltered();
                    }
                }

                this._rankedIssues.push(issue);
            }
        }

        for (let stateIndex:number = 0 ; stateIndex < numStates ; stateIndex++) {
            this._totalIssuesByState[stateIndex] = issueCounters[stateIndex].totalCount;
            this._visibleIssuesByState[stateIndex] = issueCounters[stateIndex].visibleCount;
        }

        return issueTable;
    }

    private createSwimlaneTable(filterIssues:boolean) : SwimlaneData[] {
        let numStates = this._boardData.boardStateNames.length;

        this._totalIssuesByState = new Array<number>(numStates);
        this._visibleIssuesByState = new Array<number>(numStates);
        this._rankedIssues = [];

        let indexer:SwimlaneIndexer = this.createSwimlaneIndexer();
        let issueCounters = new Array<StateIssueCounter>(numStates);
        let swimlaneBuilderTable:SwimlaneDataBuilder[] = indexer.swimlaneBuilderTable;

        //Initialise the states
        for (let stateIndex:number = 0 ; stateIndex < numStates ; stateIndex++) {
            //The swimlane indexer will take care of initialising its own issue tables
            issueCounters[stateIndex] = new StateIssueCounter();
        }

        for (let boardProject of this._boardData.boardProjects.array) {
            for (let issueKey of boardProject.rankedIssueKeys) {
                let issue:IssueData = this._allIssues.forKey(issueKey);
                let boardStateIndex:number = boardProject.mapStateIndexToBoardIndex(issue.statusIndex);

                let swimlaneIndices:number[] = indexer.swimlaneIndex(issue);
                for (let swimlaneIndex of swimlaneIndices) {
                    let targetSwimlaneBuilder:SwimlaneDataBuilder = swimlaneBuilderTable[swimlaneIndex];
                    targetSwimlaneBuilder.addIssue(boardStateIndex, issue);

                }

                let issueCounter:StateIssueCounter = issueCounters[boardStateIndex];
                issueCounter.incrementTotal();
                if (filterIssues) {
                    issue.filterIssue(this._filters);
                    if (issue.filtered) {
                        issueCounter.incrementFiltered();
                    }
                }

                this._rankedIssues.push(issue);
            }
        }

        for (let stateIndex:number = 0 ; stateIndex < numStates ; stateIndex++) {
            this._totalIssuesByState[stateIndex] = issueCounters[stateIndex].totalCount;
            this._visibleIssuesByState[stateIndex] = issueCounters[stateIndex].visibleCount;
        }

        //Create the tables and Apply the filters to the swimlanes
        let swimlaneTable:SwimlaneData[] = new Array<SwimlaneData>(swimlaneBuilderTable.length);
        for (let i:number = 0 ; i < swimlaneBuilderTable.length ; i++) {
            let swimlaneData:SwimlaneData = swimlaneBuilderTable[i].build();
            swimlaneTable[i] = swimlaneData;
            swimlaneData.filtered = indexer.filter(swimlaneData);
        }

        return swimlaneTable;
    }

    private createSwimlaneIndexer():SwimlaneIndexer {
        return new SwimlaneIndexerFactory().createSwimlaneIndexer(this._swimlane, this._filters, this._boardData);
    }

    createQueryStringParticle():string{
        let qs:string = "";
        if (this._swimlane) {
            qs = "&swimlane=" + this._swimlane;

            let hiddenEntries:SwimlaneData[] = [];
            let visibleEntries:SwimlaneData[] = [];
            for (let sd of this._swimlaneTable) {
                if (!sd.collapsed) {
                    visibleEntries.push(sd);
                } else {
                    hiddenEntries.push(sd);
                }
            }

            if (hiddenEntries.length == 0) {
                return qs;
            }

            let swimlanes:SwimlaneData[];
            if (hiddenEntries.length < visibleEntries.length) {
                qs += "&hidden-sl=";
                swimlanes = hiddenEntries;
            } else {
                qs += "&visible-sl=";
                swimlanes = visibleEntries;
            }

            let first:boolean = true;
            for (let sd of swimlanes) {
                if (first){
                    first = false;
                } else {
                    qs += ",";
                }
                qs += encodeURIComponent(sd.name);
            }
        }
        return qs;
    }

    setSwimlaneVisibilitiesFromQueryParams(queryParams:IMap<string>):void{
        let value:string;
        let visible:boolean = false;
        if (queryParams["hidden-sl"]) {
            value = queryParams["hidden-sl"];
        } else if (queryParams["visible-sl"]) {
            value = queryParams["visible-sl"];
            visible = true;
        }

        if (!value) {
            return;
        }

        let swimlaneNames:IMap<boolean> = {};
        for (let name of value.split(",")) {
            swimlaneNames[decodeURIComponent(name)] = true;
        }

        for (let sd of this._swimlaneTable) {
            if (swimlaneNames[sd.name]) {
                sd.collapsed = !visible;
            } else {
                sd.collapsed = visible;
            }
        }
    }

}

class StateIssueCounter {
    private _totalCount:number = 0;
    private _visibleCount:number = 0;

    incrementTotal() {
        this._totalCount++;
        this._visibleCount++;
    }

    incrementFiltered() {
        this._visibleCount--;
    }

    get totalCount():number {
        return this._totalCount;
    }

    get visibleCount(): number {
        return this._visibleCount;
    }
}