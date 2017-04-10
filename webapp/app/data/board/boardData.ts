import {Assignee, AssigneeDeserializer} from "./assignee";
import {Priority, PriorityDeserializer} from "./priority";
import {IssueType, IssueTypeDeserializer} from "./issueType";
import {BoardFilters, IssueDisplayDetails} from "./boardFilters";
import {IssueData} from "./issueData";
import {IMap} from "../../common/map";
import {Indexed} from "../../common/indexed";
import {Hideable} from "../../common/hide";
import {Projects, ProjectDeserializer, LinkedProject, BoardProject} from "./project";
import {IssueTable} from "./issueTable";
import {RestUrlUtil} from "../../common/RestUrlUtil";
import {BlacklistData} from "./blacklist";
import {ChangeSet} from "./change";
import {JiraComponent, JiraLabel, JiraFixVersion} from "./multiSelectNameOnlyValue";
import {BoardHeaders, State} from "./header";
import {Observable, Subject, Subscription} from "rxjs/Rx";
import {CustomFieldValues, CustomFieldDeserializer, CustomFieldValue} from "./customField";
import {ParallelTask, ParallelTaskDeserializer} from "./parallelTask";
import {SwimlaneData} from "./swimlaneData";


export class BoardData {
    private _boardName:string;
    private _code:string;
    private _showBacklog:boolean = false;
    private _view:number;
    private _headers:BoardHeaders;
    private _swimlane:string;
    private _issueTable:IssueTable;
    private _rankCustomFieldId:number;

    public jiraUrl:string;

    private _projects:Projects;

    public blacklist:BlacklistData;

    public initialized = false;
    private _initializedSubjects:Subject<void>[] = [];

    /** All the assignees */
    private _assignees:Indexed<Assignee>;
    /** All the components */
    private _components:Indexed<JiraComponent>;
    /** All the labels */
    private _labels:Indexed<JiraLabel>;
    /** All the fix-versions */
    private _fixVersions:Indexed<JiraFixVersion>;
    /** All the priorities */
    private _priorities:Indexed<Priority>;
    /** All the issue types */
    private _issueTypes:Indexed<IssueType>;

    /** All the custom fields */
    private _customFields:Indexed<CustomFieldValues>;

    //Issue details
    private _issueDisplayDetails:IssueDisplayDetails = new IssueDisplayDetails();

    private _boardFilters:BoardFilters = new BoardFilters();

    private hideables:Hideable[] = [];

    /** Flag to only recalculate the assignees in the control panel when they have been changed */
    private _hasNewAssignees:boolean = false;

    /** Flag to only recalculate the components in the control panel when they have been changed */
    private _hasNewComponents:boolean = false;

    /** Flag to only recalculate the labels in the control panel when they have been changed */
    private _hasNewLabels:boolean = false;

    /** Flag to only recalculate the fix-versions in the control panel when they have been changed */
    private _hasNewFixVersions:boolean = false;

    /** Flag to only recalculate the assignees in the control panel when they have been changed */
    private _customFieldsWithNewEntries:string[] = [];

    private _helpTexts:IMap<string> = {};

    private _parallelTasks: Indexed<ParallelTask>;

    private _issueDisplayDetailsSubject:Subject<IssueDisplayDetails> = new Subject<IssueDisplayDetails>();

    private _hideEmptySwimlanes:boolean = true;
    /**
     * Called on loading the board the first time
     * @param input the json containing the issue tables
     */
    deserialize(boardCode:string, input:any):BoardData {
        this._boardName = input.name;
        this._code = boardCode;
        this.internalDeserialize(input, true);

        this.initialized = true;
        for (let subject of this._initializedSubjects) {
            subject.next(null);
        }
        return this;
    }

    registerInitializedCallback(callback:()=>void):void {
        if (!this.initialized) {
            let subject:Subject<void> = new Subject<void>();
            this._initializedSubjects.push(subject);
            let subscription:Subscription = subject.asObservable().subscribe(
                done => {
                    callback();
                    subscription.unsubscribe();
                }
            );
        } else {
            callback();
        }
    }

    /**
     * Called when we receive a change set from the server
     *
     * @param input the json containing the details of the board change set
     */
    processChanges(input:any) {
        if (!input.changes) {
            //This is a full refresh
            this.internalDeserialize(input);
        } else {
            let changeSet:ChangeSet = new ChangeSet(input);
            if (changeSet.view != this.view) {

                if (changeSet.addedAssignees) {
                    //Make sure that the added assignees are in alphabetical order for the control panel list
                    for (let assignee of changeSet.addedAssignees) {
                        this._assignees.add(assignee.key, assignee);
                    }
                    this._assignees.sortAndReorder(
                        (a1:Assignee, a2:Assignee) => {return a1.name.localeCompare(a2.name)},
                        (assignee:Assignee) => assignee.key);
                    this._hasNewAssignees = true;
                }
                if (changeSet.addedComponents) {
                    //Make sure that the added components are in alphabetical order for the control panel list
                    for (let component of changeSet.addedComponents) {
                        this._components.add(component.name, component);
                    }
                    this._components.sortAndReorder(
                        (c1:JiraComponent, c2:JiraComponent) => {return c1.name.localeCompare(c2.name)},
                        (component:JiraComponent) => component.name);
                    this._hasNewComponents = true;
                }
                if (changeSet.addedLabels) {
                    //Make sure that the added labels are in alphabetical order for the control panel list
                    for (let label of changeSet.addedLabels) {
                        this._labels.add(label.name, label);
                    }
                    this._labels.sortAndReorder(
                        (l1:JiraLabel, l2:JiraLabel) => {return l1.name.localeCompare(l2.name)},
                        (label:JiraLabel) => label.name);
                    this._hasNewLabels = true;
                }
                if (changeSet.addedFixVersions) {
                    //Make sure that the added labels are in alphabetical order for the control panel list
                    for (let fixVersion of changeSet.addedFixVersions) {
                        this._fixVersions.add(fixVersion.name, fixVersion);
                    }
                    this._fixVersions.sortAndReorder(
                        (f1:JiraFixVersion, f2:JiraFixVersion) => {return f1.name.localeCompare(f2.name)},
                        (fixVersion:JiraFixVersion) => fixVersion.name);
                    this._hasNewFixVersions = true;
                }
                if (changeSet.addedCustomFields) {
                    //Iterate for each custom field
                    for (let cfvs of changeSet.addedCustomFields.array) {
                        //Make sure that the added custom fields are in alphabetical order for the control panel list
                        let customFieldValues:Indexed<CustomFieldValue> = this._customFields.forKey(cfvs.name).values;
                        let addedValues:CustomFieldValues = changeSet.addedCustomFields.forKey(cfvs.name);
                        for (let customFieldValue of addedValues.values.array) {
                            customFieldValues.add(customFieldValue.key, customFieldValue);
                        }
                        customFieldValues.sortAndReorder(
                            (c1:CustomFieldValue, c2:CustomFieldValue) => {return c1.displayValue.localeCompare(c2.displayValue)},
                            (cfv:CustomFieldValue) => cfv.key);
                        this._customFieldsWithNewEntries.push(cfvs.name);
                    }
                }

                if (changeSet.blacklistChanges) {
                    if (!this.blacklist) {
                        this.blacklist = new BlacklistData();
                    }
                    this.blacklist.addChangeSet(changeSet);
                }

                this._issueTable.processTableChanges(this, changeSet);


                //Finally bump the view
                this._view = changeSet.view;
            }
        }
    }

    getAndClearHasNewAssignees() : boolean {
        //TODO look into an Observable instead
        let ret:boolean = this._hasNewAssignees;
        if (ret) {
            this._hasNewAssignees = false;
        }
        return ret;
    }

    getAndClearHasNewComponents() : boolean {
        //TODO look into an Observable instead
        let ret:boolean = this._hasNewComponents;
        if (ret) {
            this._hasNewComponents = false;
        }
        return ret;
    }

    getAndClearHasNewLabels() : boolean {
        //TODO look into an Observable instead
        let ret:boolean = this._hasNewLabels;
        if (ret) {
            this._hasNewLabels = false;
        }
        return ret;
    }

    getAndClearHasNewFixVersions() : boolean {
        //TODO look into an Observable instead
        let ret:boolean = this._hasNewFixVersions;
        if (ret) {
            this._hasNewFixVersions = false;
        }
        return ret;
    }


    /**
     * Called when changes are made to the issue detail to display in the control panel
     * @param issueDisplayDetails
     */
    updateIssueDisplayDetails(issueDisplayDetails:IssueDisplayDetails) {
        this._issueDisplayDetails = issueDisplayDetails;
    }


    private internalDeserialize(input:any, first:boolean = false) {
        this._view = input.view;
        if (first) {
            this.jiraUrl = RestUrlUtil.calculateJiraUrl();
            this._rankCustomFieldId = input["rank-custom-field-id"];
        }
        this.blacklist = input.blacklist ? BlacklistData.fromInput(input.blacklist) : null;

        this._headers = BoardHeaders.deserialize(this, input);
        this._projects = new ProjectDeserializer(this.indexedBoardStateNames).deserialize(input);
        this._assignees = new AssigneeDeserializer().deserialize(input);
        this._components = JiraComponent.deserialize(input);
        this._labels = JiraLabel.deserialize(input);
        this._fixVersions = JiraFixVersion.deserialize(input);
        this._priorities = new PriorityDeserializer().deserialize(input);
        this._issueTypes = new IssueTypeDeserializer().deserialize(input);
        this._customFields = new CustomFieldDeserializer().deserialize(input);
        this._parallelTasks = new ParallelTaskDeserializer().deserialize(input, this._projects);

        if (first) {
            this._issueTable = new IssueTable(this, this._projects, this._boardFilters, this._swimlane, input);
        } else {
            this._issueTable.fullRefresh(this._projects, input);
        }
    }

    toggleSwimlaneVisibility(swimlaneIndex:number) {
        this._issueTable.toggleSwimlaneCollapsedStatus(swimlaneIndex);
    }

    get code():string {
        return this._code;
    }

    get view():number {
        return this._view;
    }

    get issueTable():IssueData[][] {
        return this._issueTable.issueTable;
    }

    get swimlaneTable():SwimlaneData[] {
        return this._issueTable.swimlaneTable;
    }

    get totalIssuesByState() : number[] {
        return this._issueTable.totalIssuesByState;
    }

    get visibleIssuesByState() : number[] {
        return this._issueTable.visibleIssuesByState;
    }

    get assignees():Indexed<Assignee> {
        return this._assignees;
    }

    get components():Indexed<JiraComponent> {
        return this._components;
    }

    get labels():Indexed<JiraLabel> {
        return this._labels;
    }

    get fixVersions():Indexed<JiraFixVersion> {
        return this._fixVersions;
    }

    get priorities():Indexed<Priority> {
        return this._priorities;
    }

    get issueTypes():Indexed<IssueType> {
        return this._issueTypes;
    }

    get boardStateNames():string[] {
        return this.indexedBoardStateNames.array;
    }

    get indexedBoardStateNames():Indexed<string> {
        return this.headers.boardStateNames;
    }

    get boardStates():State[] {
        return this.indexedBoardStates.array;
    }

    get indexedBoardStates():Indexed<State> {
        return this.headers.boardStates;
    }

    get mainStates():State[] {
        return this.headers.mainStates;
    }

    get backlogStates():State[] {
        return this.headers.backlogStates;
    }

    get owner() : string {
        return this._projects.owner;
    }

    get linkedProjects() : IMap<LinkedProject> {
        return this._projects.linkedProjects;
    }

    get boardProjects() : Indexed<BoardProject> {
        return this._projects.boardProjects;
    }

    get boardProjectCodes() : string[] {
        return this._projects.boardProjectCodes;
    }

    get swimlane():string {
        return this._swimlane;
    }

    get issueDisplayDetails():IssueDisplayDetails {
        return this._issueDisplayDetails;
    }

    get headers():BoardHeaders{
        return this._headers;
    }

    get boardName():string {
        return this._boardName;
    }

    get rankCustomFieldId():number {
        return this._rankCustomFieldId;
    }

    get showBacklog():boolean {
        if (!this._headers) {
            return this._showBacklog;
        }
        return this._headers.showBacklog;
    }

    get swimlaneVisibilityObservable():Observable<void> {
        return this._issueTable.swimlaneVisibilityObservable;
    }

    set swimlane(swimlane:string) {
        if (swimlane != this._swimlane) {
            this._swimlane = swimlane;
            this._issueTable.swimlane = swimlane;
        }
    }

    get customFields():Indexed<CustomFieldValues> {
        return this._customFields;
    }

    get rankedIssues():IssueData[] {
        return this._issueTable.rankedIssues;
    }

    get parallelTasks(): Indexed<ParallelTask> {
        return this._parallelTasks;
    }

    get issueDisplayDetailsObservable(): Observable<IssueDisplayDetails> {
        return this._issueDisplayDetailsSubject;
    }

    get hideEmptySwimlanes(): boolean {
        return this._hideEmptySwimlanes;
    }

    set hideEmptySwimlanes(value: boolean) {
        this._hideEmptySwimlanes = value;
    }

    getCustomFieldValueForIndex(name:string, index:number):CustomFieldValue {
        let values:CustomFieldValues = this._customFields.forKey(name);
        if (values) {
            return values.values.forIndex(index);
        }
        return null;
    }

    getCustomFieldValueForKey(name:string, key:string):CustomFieldValue {
        let values:CustomFieldValues = this._customFields.forKey(name);
        if (values) {
            return values.values.forKey(key);
        }
        return null;
    }

    getIssue(issueKey:string) : IssueData {
        return this._issueTable.getIssue(issueKey);
    }

    updateIssueDetail(assignee:boolean, description:boolean, info:boolean, linked:boolean) {
        this._issueDisplayDetails = new IssueDisplayDetails(assignee, description, info, linked);
        this._issueDisplayDetailsSubject.next(this._issueDisplayDetails);
    }

    updateFilters(projectFilter:any, priorityFilter:any, issueTypeFilter:any, assigneeFilter:any, componentFilter:any,
                  labelFilter:any, fixVersionFilter:any, customFieldValueFilters:IMap<any>, parallelTaskFilters:IMap<any>) {
        
        this._boardFilters.updateFilters(
            projectFilter, this._projects.boardProjectCodes,
            priorityFilter, this._priorities,
            issueTypeFilter, this._issueTypes,
            assigneeFilter, this._assignees,
            componentFilter, this._components,
            labelFilter, this._labels,
            fixVersionFilter, this._fixVersions,
            customFieldValueFilters, this._customFields,
            parallelTaskFilters, this._parallelTasks);

        this._issueTable.filters = this._boardFilters;
    }

    get filters():BoardFilters {
        return this._boardFilters;
    }

    get helpTexts():IMap<string> {
        return this._helpTexts;
    }

    set helpTexts(value:IMap<string>) {
        this._helpTexts = value;
    }

    hideHideables() {
        for (let hideable of this.hideables) {
            hideable.hide();
        }
    }

    registerHideable(hideable:Hideable) {
        this.hideables.push(hideable);
    }

    /**
     * Checks whether a board state is valid for an issue
     * @param projectCode the project code
     * @param state the state to check
     */
    isValidStateForProject(projectCode:string, state:string):boolean {
        return this.boardProjects.forKey(projectCode).isValidState(state);
    }

    setBacklogFromQueryParams(queryParams:IMap<string>, forceBacklog:boolean):void {
        if (forceBacklog) {
            this._showBacklog = true;
            return;
        }

        if (!!queryParams["bl"]) {
            //Sometimes this is parsed as a boolean and sometimes as a string
            let bl:any = queryParams["bl"];
            this._showBacklog = bl === "true" || bl === true;
        }
    }

    setFiltersFromQueryParams(queryParams:IMap<string>) {

        if (queryParams["swimlane"]) {
            //Use the setter so that we recalculate everything
            this.swimlane = queryParams["swimlane"];
        } else {
            this.swimlane = null;
        }


        this._boardFilters.createFromQueryParams(this, queryParams,
            (projectFilter:any,
             priorityFilter:any,
             issueTypeFilter:any,
             assigneeFilter:any,
             componentFilter:any,
             labelFilter:any,
             fixVersionFilter:any,
             customFieldFilters:IMap<any>,
             parallelTaskFilters:IMap<any>) => {
                this.updateFilters(projectFilter, priorityFilter, issueTypeFilter,
                    assigneeFilter, componentFilter, labelFilter, fixVersionFilter, customFieldFilters, parallelTaskFilters);
        });

        this.updateIssueDisplayDetails(this.parseIssueDisplayDetails(queryParams));

        if (this._swimlane) {
            this._issueTable.setSwimlaneVisibilitiesFromQueryParams(queryParams);
        }

        if (!!queryParams["showEmptySl"]) {
            let showEmptySwimlanes:any = queryParams["showEmptySl"];
            this.hideEmptySwimlanes = showEmptySwimlanes === "true" || showEmptySwimlanes === true ?
                false : true;
        } else {
            this.hideEmptySwimlanes = true;
        }

        this._headers.setVisibilitiesFromQueryParams(queryParams);
    }

    private parseIssueDisplayDetails(queryParams:IMap<string>):IssueDisplayDetails{
        let detail:string = queryParams["detail"];
        if (detail) {
            let details:string[] = detail.split(",");
            let assignee:boolean = true;
            let summary:boolean = true;
            let info:boolean = true;
            let linkedIssues:boolean = true;
            for (let value of details) {
                if (value === 'assignee') {
                    assignee = false;
                } else if (value === 'description') {
                    summary = false;
                } else if (value === 'info') {
                    info = false;
                } else if (value === 'linked') {
                    linkedIssues = false;
                }
            }
            return new IssueDisplayDetails(assignee, summary, info, linkedIssues);
        }
        return new IssueDisplayDetails();
    }

    createQueryStringParticles(url:string):string{
        url = url + "?board=" + this.code;

        if (this.showBacklog) {
            url += "&bl=true";
        }

        url += this.issueDisplayDetails.createQueryStringParticle();
        url += this.filters.createQueryStringParticles();
        url += this.headers.createQueryStringParticle();
        url += this._issueTable.createQueryStringParticle();

        if (!this.hideEmptySwimlanes) {
            url += "&showEmptySl=true";
        }
        return url;
    }

    canRank(projectCode:string):boolean {
        return this._projects.canRank(projectCode);
    }
}



