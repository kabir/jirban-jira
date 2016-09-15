/*
 * JBoss, Home of Professional Open Source.
 * Copyright 2016, Red Hat, Inc., and individual contributors
 * as indicated by the @author tags. See the copyright.txt file in the
 * distribution for a full listing of individual contributors.
 *
 * This is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * This software is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this software; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */
package org.jirban.jira.impl;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import javax.inject.Named;

import org.jirban.jira.JirbanLogger;
import org.jirban.jira.api.BoardManager;
import org.jirban.jira.impl.config.CustomFieldConfig;
import org.ofbiz.core.entity.GenericEntityException;
import org.ofbiz.core.entity.GenericValue;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Autowired;

import com.atlassian.core.util.map.EasyMap;
import com.atlassian.crowd.embedded.api.User;
import com.atlassian.event.api.EventListener;
import com.atlassian.event.api.EventPublisher;
import com.atlassian.jira.bc.project.component.ProjectComponent;
import com.atlassian.jira.event.issue.IssueEvent;
import com.atlassian.jira.event.type.EventType;
import com.atlassian.jira.issue.Issue;
import com.atlassian.jira.issue.index.IndexException;
import com.atlassian.jira.project.Project;
import com.atlassian.jira.project.ProjectManager;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;

/**
 * The listener listening to issue events, and delegating relevant ones to the issue table.
 * When creating/updating an issue a series of events occur in the same thread as part of handling the request. The two
 * important ones for our purposes are:
 * <ol>
 *     <li>The {@code IssueEvent} - Here we grab the changes to occur in {@link #onIssueEvent(IssueEvent)} and
 *     construct the needed {@code JirbanIssueEvent} instances.</li>
 *     <li>The {@code ReindexIssuesCompletedEvent} - This is similar to an after commit, where Jira has completed
 *     updating the state of the issues.</li>
 * </ol>
 * <p/>
 * The {@code JirbanIssueEvent} instances created in the first step are used to update our board caches when receiving
 * the second event. Note that this split is *ONLY NECESSARY* when an action is performed which updates the status/rank
 * of an issue, since when rebuilding the board we need to query the issues by status, and the status updates are only
 * available after the second step. All other changed data (e.g. assignee, issue type, summary, priority etc.) is
 * available in the first step. So for a create, or an update involving a state change or a rank change we delay updating
 * the board caches until we received the {@code ReindexIssuesCompletedEvent}. For everything else, we update the board
 * caches when we receive the first {@code IssueEvent}.
 * <p/>
 * However, if an issue is only re-ranked via Jirban or Jira Agile's board, the {@code ReindexIssuesCompletedEvent} and
 * the {@code IssueEvent} can come in any order. However a 'pure' re-rank is initiated by a {@code LexoRankBalanceEvent},
 * so we use JirbanEventWrapper to track that we have all the needed information.
 *
 *
 *
 * @author Kabir Khan
 */
@Named("jirbanIssueEventListener")
public class JirbanIssueEventListener implements InitializingBean, DisposableBean {
    private static final Logger log = LoggerFactory.getLogger(JirbanIssueEventListener.class);

    private static final String CHANGE_LOG_FIELD = "field";
    private static final String CHANGE_LOG_ISSUETYPE = "issuetype";
    private static final String CHANGE_LOG_PRIORITY = "priority";
    private static final String CHANGE_LOG_SUMMARY = "summary";
    private static final String CHANGE_LOG_ASSIGNEE = "assignee";
    private static final String CHANGE_LOG_STATUS = "status";
    private static final String CHANGE_LOG_OLD_STRING = "oldstring";
    private static final String CHANGE_LOG_NEW_STRING = "newstring";
    private static final String CHANGE_LOG_NEW_VALUE = "newvalue";
    private static final String CHANGE_LOG_RANK = "Rank";
    private static final String CHANGE_LOG_PROJECT = "project";
    private static final String CHANGE_LOG_OLD_VALUE = "oldvalue";
    private static final String CHANGE_LOG_ISSUE_KEY = "Key";
    private static final String CHANGE_LOG_COMPONENT = "Component";
    private static final String CHANGE_LOG_FIELDTYPE = "fieldtype";
    private static final String CHANGE_LOG_CUSTOM = "custom";

    @ComponentImport
    private final EventPublisher eventPublisher;

    @ComponentImport
    private final ProjectManager projectManager;

    private final BoardManager boardManager;

    private final WrappedThreadLocal<JirbanRankEventWrapper> rankEvents = new WrappedThreadLocal<>();


    /**
     * Constructor.
     * @param eventPublisher injected {@code EventPublisher} implementation.
     * @param projectManager injected {@code ProjectManager} implementation.
     * @param boardManager injected {@code BoardManager} implementation.
     */
    @Autowired
    public JirbanIssueEventListener(EventPublisher eventPublisher,
                                    ProjectManager projectManager, BoardManager boardManager) {
        this.eventPublisher = eventPublisher;
        this.projectManager = projectManager;
        this.boardManager = boardManager;
    }

    /**
     * Called when the plugin has been enabled.
     * @throws Exception
     */
    public void afterPropertiesSet() throws Exception {
        // register ourselves with the EventPublisher
        eventPublisher.register(this);
    }

    /**
     * Called when the plugin is being disabled or removed.
     * @throws Exception
     */
    public void destroy() throws Exception {
        // unregister ourselves with the EventPublisher
        eventPublisher.unregister(this);
        rankEvents.clearAll();
    }

    @EventListener
    public void onRankEvent(JirbanRankEvent event) {
        JirbanLogger.LOGGER.debug("JirbanRankEvent {} on thread {}", event, Thread.currentThread().getName());
        if (boardManager.hasBoardsForProjectCode(event.getProjectCode())) {
            rankEvents.set(new JirbanRankEventWrapper(event));
        }
    }

    @EventListener
    public void onRankDoneEvent(JirbanRankDoneEvent event) {
        JirbanLogger.LOGGER.debug("JirbanRankDoneEvent {} on thread {}", event, Thread.currentThread().getName());
        rankEvents.remove();
    }
    /**
     * Receives any {@code IssueEvent}s sent by JIRA
     * @param issueEvent the event passed to us
     */
    @EventListener
    public void onIssueEvent(IssueEvent issueEvent) throws IndexException {
        JirbanLogger.LOGGER.debug("IssueEvent {} on thread {}", issueEvent, Thread.currentThread().getName());

        long eventTypeId = issueEvent.getEventTypeId();
        // if it's an event we're interested in, log it

        //There are no events for when updating linked issues. Instead we invalidate the boards every five minutes in
        //BoardManagerImpl which forces a full refresh of the board which will bring in linked issues

        //CREATED, DELETED and MOVED do not have a worklog
        if (eventTypeId == EventType.ISSUE_CREATED_ID) {
            //Does not have a worklog
            onCreateEvent(issueEvent);
        } else if (eventTypeId == EventType.ISSUE_DELETED_ID) {
            //Does not have a worklog
            onDeleteEvent(issueEvent);

        } else if (eventTypeId == EventType.ISSUE_MOVED_ID) {
            //Has a worklog. We need to take into account the old values to delete the issue from the old project boards,
            //while we use the issue in the event to create the issue in the new project boards.
            onMoveEvent(issueEvent);
        } else if (eventTypeId == EventType.ISSUE_ASSIGNED_ID ||
                eventTypeId == EventType.ISSUE_UPDATED_ID ||
                eventTypeId == EventType.ISSUE_GENERICEVENT_ID ||
                eventTypeId == EventType.ISSUE_RESOLVED_ID ||
                eventTypeId == EventType.ISSUE_CLOSED_ID ||
                eventTypeId == EventType.ISSUE_REOPENED_ID ||
                eventTypeId == EventType.ISSUE_WORKSTARTED_ID ||
                eventTypeId == EventType.ISSUE_WORKSTOPPED_ID) {
            //Which of these events gets triggered depends on the workflow for the project, and other factors.
            //E.g. in a normal workflow project, the ISSUE_RESOLVED_ID, ISSUE_CLOSED_ID, ISSUE_REOPENED_ID events
            //are triggered, while in the Kanban workflow those events use the ISSUE_GENERIC_EVENT_ID.
            //The same underlying fields are reported changed in the worklog though.
            //Another example is that if you just change the assignee, you get an ISSUE_ASSIGNED_ID event, but if you
            //change several fields (including the assignee) you get an event with ISSUE_UPDATED_ID and all the fields
            //affected in the worklog
            onWorklogEvent(issueEvent);
        }
    }

    private void onCreateEvent(IssueEvent issueEvent) throws IndexException {
        final Issue issue = issueEvent.getIssue();
        if (!isAffectedProject(issue.getProjectObject().getKey())) {
            return;
        }

        final Set<CustomFieldConfig> customFields = boardManager.getCustomFieldsForCreateEvent(issue.getProjectObject().getKey());
        final Map<Long, String> values;
        if (customFields.size() == 0) {
            values = Collections.emptyMap();
        } else {
            values = new HashMap<>();
            for (CustomFieldConfig cfg : customFields) {
                if (!values.containsKey(cfg.getId())) {
                    final Object value = issue.getCustomFieldValue(cfg.getJiraCustomField());
                    String stringValue = value == null ? null : cfg.getUtil().getCreateEventValue(value);
                    values.put(cfg.getId(), stringValue);
                }
            }
        }

        final JirbanIssueEvent event = JirbanIssueEvent.createCreateEvent(issue.getKey(), issue.getProjectObject().getKey(),
                issue.getIssueTypeObject().getName(), issue.getPriorityObject().getName(), issue.getSummary(),
                issue.getAssignee(), issue.getComponentObjects(), issue.getStatusObject().getName(), values);

        boardManager.handleEvent(event);

        //TODO there could be linked issues
    }

    private void onDeleteEvent(IssueEvent issueEvent) throws IndexException {
        final Issue issue = issueEvent.getIssue();
        if (!isAffectedProject(issue.getProjectObject().getKey())) {
            return;
        }

        final JirbanIssueEvent event = JirbanIssueEvent.createDeleteEvent(issue.getKey(), issue.getProjectObject().getKey());
        boardManager.handleEvent(event);
    }

    private void onWorklogEvent(IssueEvent issueEvent) throws IndexException {
        final Issue issue = issueEvent.getIssue();
        if (!isAffectedProject(issue.getProjectObject().getKey())) {
            recordNotRelevant(issue.getKey());
            return;
        }

        //All the fields that changed, and only those, are in the change log.
        //For our created event, only set the fields that actually changed.
        String issueType = null;
        String priority = null;
        String summary = null;
        User assignee = null;
        Collection<ProjectComponent> components = null;
        String oldState = null;
        String state = null;
        boolean reranked = false;
        Map<Long, String> customFieldValues = null;

        List<GenericValue> changeItems = getWorkLog(issueEvent);
        for (GenericValue change : changeItems) {
            final String field = change.getString(CHANGE_LOG_FIELD);
            if (field.equals(CHANGE_LOG_ISSUETYPE)) {
                issueType = issue.getIssueTypeObject().getName();
            } else if (field.equals(CHANGE_LOG_PRIORITY)) {
                priority = issue.getPriorityObject().getName();
            } else if (field.equals(CHANGE_LOG_SUMMARY)) {
                summary = issue.getSummary();
            } else if (field.equals(CHANGE_LOG_ASSIGNEE)) {
                assignee = issue.getAssignee();
                if (assignee == null) {
                    assignee = JirbanIssueEvent.UNASSIGNED;
                }
            } else if (field.equals(CHANGE_LOG_STATUS)) {
                state = issue.getStatusObject().getName();
                oldState = change.getString(CHANGE_LOG_OLD_STRING);
            } else if (field.equals(CHANGE_LOG_RANK)) {
                reranked = true;
            } else if (field.equals(CHANGE_LOG_COMPONENT)) {
                components = issue.getComponentObjects();
            } else if (change.get(CHANGE_LOG_FIELDTYPE).equals(CHANGE_LOG_CUSTOM)) {
                Set<CustomFieldConfig> configs = boardManager.getCustomFieldsForUpdateEvent(issue.getProjectObject().getKey(), field);
                if (configs.size() > 0) {
                    if (customFieldValues == null) {
                        customFieldValues = new HashMap<>();
                    }
                    for (CustomFieldConfig cfg : configs) {
                        String key = cfg.getUtil().getUpdateEventValue(
                                (String) change.get(CHANGE_LOG_NEW_VALUE), (String) change.get(CHANGE_LOG_NEW_STRING));
                        customFieldValues.put(cfg.getId(), key);
                    }
                }
            }
        }
        final JirbanIssueEvent event = JirbanIssueEvent.createUpdateEvent(
                issue.getKey(), issue.getProjectObject().getKey(), issueType, priority,
                summary, assignee, components,
                //Always pass in the existing/old state of the issue
                oldState != null ? oldState : issue.getStatusObject().getName(),
                state, reranked, customFieldValues);
        boardManager.handleEvent(event);
        if (reranked) {
            handleRerankEvent(issue.getKey());
        }
    }

    private void onMoveEvent(IssueEvent issueEvent) throws IndexException {
        //This is kind of the same as the 'onWorklogEvent' but we also need to take into account the old value of the project
        //and remove from there if it is a board project. Also, if the new value is a board project we need to add it there.
        //So, it is a bit like a delete (although we need the worklog for that), and a create.

        //1) We need to inspect the change log to find the project we are deleting from
        String oldProjectCode = null;
        String oldIssueKey = null;
        String newState = null;
        List<GenericValue> changeItems = getWorkLog(issueEvent);
        for (GenericValue change : changeItems) {
            final String field = change.getString(CHANGE_LOG_FIELD);
            if (field.equals(CHANGE_LOG_PROJECT)) {
                String oldProjectId = change.getString(CHANGE_LOG_OLD_VALUE);
                Project project = projectManager.getProjectObj(Long.valueOf(oldProjectId));
                oldProjectCode = project.getKey();
            } else if (field.equals(CHANGE_LOG_ISSUE_KEY)) {
                oldIssueKey = change.getString(CHANGE_LOG_OLD_STRING);
            } else if (field.equals(CHANGE_LOG_ISSUETYPE)){
                newState = change.getString(CHANGE_LOG_NEW_STRING);
            }
        }

        if (isAffectedProject(oldProjectCode)) {
            final JirbanIssueEvent event = JirbanIssueEvent.createDeleteEvent(oldIssueKey, oldProjectCode);
            boardManager.handleEvent(event);
        }

        //2) Then we can do a create on the project with the issue in the event
        final Issue issue = issueEvent.getIssue();
        onCreateEvent(issueEvent);
        if (!isAffectedProject(issue.getProjectObject().getKey())) {
            return;
        }
        //Note that the status column in the event issue isn't up to date yet, we need to get it from the change log
        //if it was updated
        newState = newState == null ? issue.getStatusObject().getName() : newState;

        final JirbanIssueEvent event = JirbanIssueEvent.createCreateEvent(issue.getKey(), issue.getProjectObject().getKey(),
                issue.getIssueTypeObject().getName(), issue.getPriorityObject().getName(), issue.getSummary(),
                issue.getAssignee(), issue.getComponentObjects(), newState, Collections.emptyMap());
        boardManager.handleEvent(event);
    }

    private List<GenericValue> getWorkLog(IssueEvent issueEvent) {
        final GenericValue changeLog = issueEvent.getChangeLog();
        if (changeLog == null) {
            return Collections.emptyList();
        }

        final List<GenericValue> changeItems;
        try {
            changeItems = changeLog.getDelegator().findByAnd("ChangeItem", EasyMap.build("group", changeLog.get("id")));
        } catch (GenericEntityException e) {
            e.printStackTrace();
            return Collections.emptyList();
        }
        return changeItems;
    }

    private void recordNotRelevant(String issueKey) {
        JirbanRankEventWrapper rankEventWrapper = rankEvents.get();
        if (rankEventWrapper != null) {
            rankEventWrapper.recordRelevant(issueKey, false);
            checkCompleteRankEvent(rankEventWrapper);
        }
    }

    private void handleRerankEvent(String issueKey) {
        JirbanRankEventWrapper rankEventWrapper = rankEvents.get();
        if (rankEventWrapper != null) {
            rankEventWrapper.recordRelevant(issueKey, true);
            checkCompleteRankEvent(rankEventWrapper);
        }
    }

    private void checkCompleteRankEvent(JirbanRankEventWrapper rankEventWrapper) {
        if (!rankEventWrapper.hasRelevantIssues()) {
            rankEvents.remove();
            return;
        }
        if (rankEventWrapper.isComplete()) {
            JirbanRankEvent rankEvent = rankEventWrapper.getRankEvent();
            rankEvents.remove();
            //TODO handle change
            System.out.println("*** Reranking issues " + rankEvent);
            boardManager.handleRankEvent(rankEvent);
        }
    }


    private boolean isAffectedProject(String projectCode) {
        return boardManager.hasBoardsForProjectCode(projectCode);
    }

    /**
     * Alternative thread local implementation to avoid possible memory leaks on undeploy
     *
     * @param <T>
     */
    private static class WrappedThreadLocal<T> {
        private final Map<Thread, T> delayedEvents = Collections.synchronizedMap(new IdentityHashMap<>());

        void set(T value) {
            JirbanLogger.LOGGER.debug("Setting item on thread {}", Thread.currentThread().getName());
            delayedEvents.put(Thread.currentThread(), value);
        }

        T get() {
            return delayedEvents.get(Thread.currentThread());
        }

        void remove() {
            JirbanLogger.LOGGER.debug("Removing item on thread {}", Thread.currentThread().getName());
            delayedEvents.remove(Thread.currentThread());
        }

        void clearAll() {
            delayedEvents.clear();
        }
    }

    private static class JirbanRankEventWrapper {
        private final JirbanRankEvent rankEvent;
        private final Set<String> rankedIssues;
        private final Set<String> relevantIssues;

        public JirbanRankEventWrapper(JirbanRankEvent rankEvent) {
            this.rankEvent = rankEvent;
            rankedIssues = new HashSet<>(rankEvent.getIssues());
            relevantIssues = new HashSet<>(rankEvent.getIssues());
        }

        void recordRelevant(String issueKey, boolean relevant) {
            if (!relevant) {
                relevantIssues.remove(issueKey);
            }
            rankedIssues.remove(issueKey);
        }

        boolean hasRelevantIssues() {
            return relevantIssues.size() != 0;
        }

        boolean isComplete() {
            return rankedIssues.size() == 0;
        }

        JirbanRankEvent getRankEvent() {
            if (rankEvent.getIssues().size() == relevantIssues.size()) {
                return rankEvent;
            }
            List<String> newIssues = new ArrayList<>();
            for (String key : rankEvent.getIssues()) {
                if (relevantIssues.contains(key)) {
                    newIssues.add(key);
                }
            }
            return JirbanRankEvent.create(newIssues, rankEvent.getAfterKey(), rankEvent.getBeforeKey());
        }
    }
}
