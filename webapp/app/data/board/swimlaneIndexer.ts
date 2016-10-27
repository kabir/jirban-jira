import {BoardData} from "./boardData";
import {BoardFilters, NONE} from "./boardFilters";
import {IssueData} from "./issueData";
import {IMap} from "../../common/map";
import {SwimlaneData} from "./issueTable";
import {CustomFieldValues, CustomFieldValue} from "./customField";
import {Indexed} from "../../common/indexed";
import {Priority} from "./priority";
import {IssueType} from "./issueType";
import {Assignee} from "./assignee";
import {JiraComponent} from "./component";

const INITIAL_ARRAY_SIZE = 8;

export interface SwimlaneIndexer {
    filter(swimlaneData:SwimlaneData):boolean;
    matchIssues(targetIssue:IssueData, issue:IssueData):boolean;
    indexIssue(boardStateIndex: number, issue: IssueData):void;
    createSwimlaneTable():SwimlaneData[];
}

export class SwimlaneMatcher {
    constructor(
        private _targetIssue:IssueData,
        private _indexer:SwimlaneIndexer){
    }

    matchesSwimlane(issue:IssueData):boolean{
        return this._indexer.matchIssues(this._targetIssue, issue);
    }
}

export class SwimlaneIndexerFactory {
    createSwimlaneIndexer(swimlane:string, filters:BoardFilters, boardData:BoardData):SwimlaneIndexer {
        return this._createIndexer(swimlane, filters, boardData, true);
    }

    createSwimlaneMatcher(swimlane:string, targetIssue:IssueData):SwimlaneMatcher {
        let indexer:SwimlaneIndexer = this._createIndexer(swimlane, null, null, false);
        if (indexer == null) {
            return null;
        }
        return new SwimlaneMatcher(targetIssue, indexer);
    }

    private _createIndexer(swimlane:string, filters:BoardFilters, boardData:BoardData, initTable:boolean):SwimlaneIndexer {
        if (swimlane === "project") {
            return new ProjectSwimlaneIndexer(filters, boardData, initTable);
        } else if (swimlane === "priority") {
            return new PrioritySwimlaneIndexer(filters, boardData, initTable);
        } else if (swimlane === "issue-type") {
            return new IssueTypeSwimlaneIndexer(filters, boardData, initTable);
        } else if (swimlane === "assignee") {
            return new AssigneeSwimlaneIndexer(filters, boardData, initTable);
        } else if (swimlane === "component") {
            return new ComponentSwimlaneIndexer(filters, boardData, initTable);
        } else if (swimlane) {
            if (boardData && boardData.customFields) {
                let cfvs:CustomFieldValues = boardData.customFields.forKey(swimlane);
                if (cfvs) {
                    return new CustomFieldSwimlaneIndexer(filters, boardData, initTable, swimlane, cfvs.values);
                }
            } else {
                console.log("Unknown swimlane '" + swimlane + "'. boardData:" + boardData);
            }
        }

        return null;
    }
}

abstract class BaseIndexer {
    protected _swimlaneTable:SwimlaneEntry[];
    protected abstract swimlaneIndex(issue:IssueData):number[];

    constructor(
        protected _filters:BoardFilters,
        protected _boardData:BoardData) {
    }

    createSwimlaneTable():SwimlaneData[] {
        let data:SwimlaneData[] = new Array<SwimlaneData>(this._swimlaneTable.length);
        for (let i:number = 0 ; i < this._swimlaneTable.length ; i++) {
            let entry:SwimlaneEntry = this._swimlaneTable[i];
            data[i] = new SwimlaneData(entry.name, entry.index, entry.createTable());
        }
        return data;
    }


    indexIssue(boardStateIndex: number, issue: IssueData): void {
        let swimlaneIndices:number[] = this.swimlaneIndex(issue);
        for (let swimlaneIndex of swimlaneIndices) {
            let targetSwimlane:SwimlaneEntry = this._swimlaneTable[swimlaneIndex];
            targetSwimlane.addIssue(boardStateIndex, issue);
        }
    }
}

class ProjectSwimlaneIndexer extends BaseIndexer implements SwimlaneIndexer {
    private _indices:IMap<number> = {};

    constructor(filters:BoardFilters, boardData:BoardData, initTable:boolean) {
        super(filters, boardData);
        if (initTable) {
            let i:number = 0;
            for (let name of boardData.boardProjectCodes) {
                this._indices[name] = i;
                i++;
            }

            this._swimlaneTable = createTable(boardData, boardData.boardProjectCodes);
        }
    }

    protected swimlaneIndex(issue:IssueData):number[] {
        return [this._indices[issue.projectCode]];
    }

    filter(swimlaneData:SwimlaneData):boolean {
        return this._filters.filterProject(swimlaneData.name);
    }

    matchIssues(targetIssue:IssueData, issue:IssueData) : boolean {
        return targetIssue.projectCode === issue.projectCode;
    }
}

class PrioritySwimlaneIndexer extends BaseIndexer implements SwimlaneIndexer {
    private _swimlaneNames:string[];

    constructor(filters:BoardFilters, boardData:BoardData, initTable:boolean) {
        super(filters, boardData);
        if (initTable) {
            this._swimlaneNames =
                createNamesArray(boardData.priorities.array, (priority:Priority) => {return priority.name});
            this._swimlaneTable = createTable(boardData, this._swimlaneNames);
        }
    }

    protected swimlaneIndex(issue:IssueData):number[] {
        return [this._boardData.priorities.indices[issue.priorityName]];
    }

    filter(swimlaneData:SwimlaneData):boolean {
        return this._filters.filterPriority(swimlaneData.name);
    }

    matchIssues(targetIssue:IssueData, issue:IssueData) : boolean {
        return targetIssue.priority.name === issue.priority.name;
    }
}

class IssueTypeSwimlaneIndexer extends BaseIndexer implements SwimlaneIndexer {
    private _swimlaneNames:string[];

    constructor(filters:BoardFilters, boardData:BoardData, initTable:boolean) {
        super(filters, boardData);
        if (initTable) {
            this._swimlaneNames =
                createNamesArray(boardData.issueTypes.array, (issueType:IssueType) => {return issueType.name});
            this._swimlaneTable = createTable(boardData, this._swimlaneNames);
        }
    }

    protected swimlaneIndex(issue:IssueData):number[] {
        return [this._boardData.issueTypes.indices[issue.typeName]];
    }

    filter(swimlaneData:SwimlaneData):boolean {
        return this._filters.filterIssueType(swimlaneData.name);
    }

    matchIssues(targetIssue:IssueData, issue:IssueData) : boolean {
        return targetIssue.type.name === issue.type.name;
    }
}

class AssigneeSwimlaneIndexer extends BaseIndexer implements SwimlaneIndexer {
    private _swimlaneNames:string[] = [];

    constructor(filters:BoardFilters, boardData:BoardData, initTable:boolean) {
        super(filters, boardData);
        if (initTable) {
            this._swimlaneNames =
                createNamesArray(boardData.assignees.array, (assignee:Assignee) => {return assignee.name}, true);
            this._swimlaneTable = createTable(boardData, this._swimlaneNames);
        }
    }

    protected swimlaneIndex(issue:IssueData):number[] {
        if (!issue.assignee) {
            return [this._swimlaneNames.length - 1];
        }
        return [this._boardData.assignees.indices[issue.assignee.key]];
    }

    filter(swimlaneData:SwimlaneData):boolean {
        let assigneeKey:string = null;
        if (swimlaneData.index < this._swimlaneNames.length - 1) {
            assigneeKey = this._boardData.assignees.forIndex(swimlaneData.index).key;
        }
        return this._filters.filterAssignee(assigneeKey);
    }

    matchIssues(targetIssue:IssueData, issue:IssueData):boolean {
        if (!targetIssue.assignee  && !issue.assignee) {
            return true;
        } else if (targetIssue.assignee && issue.assignee) {
            return targetIssue.assignee.key === issue.assignee.key;
        }
        return false;
    }
}


class ComponentSwimlaneIndexer extends BaseIndexer implements SwimlaneIndexer {
    private _swimlaneNames:string[];

    constructor(filters:BoardFilters, boardData:BoardData, initTable:boolean) {
        super(filters, boardData);
        if (initTable) {
            this._swimlaneNames =
                createNamesArray(boardData.components.array, (component:JiraComponent) => {return component.name}, true);

            this._swimlaneTable = createTable(boardData, this._swimlaneNames);
        }
    }

    protected swimlaneIndex(issue:IssueData):number[] {
        if (!issue.components) {
            return [this._swimlaneNames.length - 1];
        }

        let lanes:number[] = new Array<number>(issue.components.array.length);
        for (let i:number = 0 ; i < lanes.length ; i++) {
            lanes[i] = this._boardData.components.indices[issue.components.array[i].name];
        }
        return lanes;
    }

    filter(swimlaneData:SwimlaneData):boolean {
        let componentName:string = null;
        if (swimlaneData.index < this._swimlaneNames.length - 1) {
            componentName = this._boardData.components.forIndex(swimlaneData.index).name;
        }
        return this._filters.filterComponent(componentName);
    }

    matchIssues(targetIssue:IssueData, issue:IssueData):boolean {
        if (!targetIssue.assignee  && !issue.assignee) {
            return true;
        } else if (targetIssue.assignee && issue.assignee) {
            return targetIssue.assignee.key === issue.assignee.key;
        }
        return false;
    }
}

class CustomFieldSwimlaneIndexer extends BaseIndexer implements SwimlaneIndexer {
    private _customFieldName:string;
    private _customFieldValues:Indexed<CustomFieldValue>;
    private _swimlaneNames:string[];

    constructor(filters:BoardFilters, boardData:BoardData, initTable:boolean, customFieldName:string, customFieldValues:Indexed<CustomFieldValue>) {
        super(filters, boardData);
        this._customFieldName = customFieldName;
        this._customFieldValues = customFieldValues;
        if (initTable) {
            this._swimlaneNames =
                createNamesArray(customFieldValues.array, (cfv:CustomFieldValue) => {return cfv.displayValue}, true);

            this._swimlaneTable = createTable(boardData, this._swimlaneNames);
        }
    }

    protected swimlaneIndex(issue:IssueData):number[] {
        let customFieldValue:CustomFieldValue = issue.getCustomFieldValue(this._customFieldName);
        if (!customFieldValue) {
            //Put it into the 'None' bucket
            return [this._swimlaneNames.length - 1];
        }
        return [this._customFieldValues.indices[customFieldValue.key]];
    }

    filter(swimlaneData:SwimlaneData):boolean {
        let key:string = null;
        if (swimlaneData.index < this._swimlaneNames.length - 1) {
            key = this._customFieldValues.forIndex(swimlaneData.index).key;
        } else {
            key = NONE;
        }
        return this._filters.filterCustomField(this._customFieldName, key);
    }

    matchIssues(targetIssue:IssueData, issue:IssueData):boolean {
        let tgtValue:CustomFieldValue = targetIssue.getCustomFieldValue(this._customFieldName);
        let value:CustomFieldValue = issue.getCustomFieldValue(this._customFieldName);

        if (!tgtValue && !value) {
            return true;
        } else if (tgtValue && value) {
            return tgtValue.key === value.key;
        }
        return false;
    }
}

class SwimlaneEntry {
    private _boardData:BoardData
    private _name:string;
    private _issueTable:IssueData[][];
    private _issueTableIndices:number[];

    private _index:number;

    constructor(private boardData:BoardData, name:string, index:number) {
        this._boardData = boardData;
        this._name = name;
        this._index = index;
        let states = boardData.boardStateNames.length;
        this._issueTable = new Array<IssueData[]>(states);
        this._issueTableIndices = new Array<number>(states);
        for (let i:number = 0 ; i < states ; i++) {
            this._issueTable[i] = new Array<IssueData>(INITIAL_ARRAY_SIZE);
            this._issueTableIndices[i] = 0;
        }
    }

    get name() {
        return this._name;
    }

    get index() {
        return this._index;
    }

    addIssue(boardStateIndex: number, issue: IssueData) {
        let issues:IssueData[] = this._issueTable[boardStateIndex];
        let index = this._issueTableIndices[boardStateIndex];
        if (index >= issues.length) {
            issues.length = issues.length * 2;
        }
        issues[index] = issue;
        this._issueTableIndices[boardStateIndex] = ++index;
    }

    createTable():IssueData[][] {
        for (let i:number = 0 ; i < this._issueTable.length ; i++) {
            this._issueTable[i].length = this._issueTableIndices[i];
        }
        return this._issueTable;
    }
}

function createNamesArray<T>(array:T[], getName:(entry:T)=>string, hasNone:boolean = false):string[]{
    let result:string[] = new Array<string>(INITIAL_ARRAY_SIZE);

    let i:number = 0;
    for (let t of array) {
        if (i >= result.length) {
            result.length = result.length * 2;
        }
        result[i] = getName(t);
        i++;
    }
    if (hasNone) {
        result.length = i + 1;
        result[i] = "None";
    } else {
        result.length = i;
    }
    return result;
}

function createTable(boardData:BoardData, swimlaneNames:string[]) : SwimlaneEntry[] {
    let swimlaneTable:SwimlaneEntry[] = new Array<SwimlaneEntry>(swimlaneNames.length);
    let slIndex:number = 0;
    let i:number = 0;
    for (let swimlaneName of swimlaneNames) {
        swimlaneTable[i++] = new SwimlaneEntry(boardData, swimlaneName, slIndex++);
    }
    return swimlaneTable;
}