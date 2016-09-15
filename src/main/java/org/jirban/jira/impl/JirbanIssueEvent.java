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

import java.util.Collection;
import java.util.Collections;
import java.util.Map;

import com.atlassian.crowd.embedded.api.User;
import com.atlassian.jira.bc.project.component.ProjectComponent;

/**
 * @author Kabir Khan
 */
public class JirbanIssueEvent {
    private final Type type;
    private final String issueKey;
    private final String projectCode;
    private final Detail detail;

    private JirbanIssueEvent(Type type, String issueKey, String projectCode, Detail detail) {
        this.type = type;
        this.issueKey = issueKey;
        this.projectCode = projectCode;
        this.detail = detail;
    }

    public Type getType() {
        return type;
    }

    public String getIssueKey() {
        return issueKey;
    }

    public String getProjectCode() {
        return projectCode;
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder("JirbanIssueEvent{type="
                + type + ";key=" + issueKey + ";project=" + projectCode);
        if (detail != null) {
            sb.append("Detail{");
            sb.append("issueType=" + detail.issueType);
            sb.append(";priority=" + detail.priority);
            sb.append(";summary=" + detail.summary);
            sb.append(";assignee=" + (detail.assignee != null ? detail.assignee.getName() : "null"));
            sb.append(";state=" + detail.state);
            sb.append(";reorder=" + detail.reranked);
            sb.append("}}");
        } else {
            sb.append("}");
        }
        return sb.toString();
    }

    /**
     * If {@link #getType()} is {@link Type#DELETE}, {@code null} is returned. Otherwise a {@code Detail} object is
     * returned. For a {@link Type#DELETE} the {@code Detail} object is populated with all the fields set on the issue
     * when it was created. For a {@link Type#DELETE} the {@code Detail} object is populated with the fields that were
     * actually changed.
     *
     * @return the details
     */
    public Detail getDetails() {
        return detail;
    }

    public static JirbanIssueEvent createDeleteEvent(String issueKey, String projectCode) {
        return new JirbanIssueEvent(Type.DELETE, issueKey, projectCode, null);
    }

    public static JirbanIssueEvent createCreateEvent(String issueKey, String projectCode, String issueType, String priority,
                                                     String summary, User assignee, Collection<ProjectComponent> components,
                                                     String state, Map<Long, String> customFieldValues) {
        Detail detail = new Detail(issueType, priority, summary, assignee, components, null, state, true, customFieldValues);
        return new JirbanIssueEvent(Type.CREATE, issueKey, projectCode, detail);
    }

    public static JirbanIssueEvent createUpdateEvent(String issueKey, String projectCode, String issueType, String priority,
                                                     String summary, User assignee, Collection<ProjectComponent> components,
                                                     String currentState, String state, boolean reranked,
                                                     Map<Long, String> customFieldValues) {
        Detail detail = new Detail(issueType, priority, summary, assignee, components, currentState, state, reranked, customFieldValues);
        return new JirbanIssueEvent(Type.UPDATE, issueKey, projectCode, detail);
    }

    public boolean isRerankOnly() {
        if (type == Type.UPDATE) {
            if (detail.isReranked()) {
                return detail.getComponents() == null && detail.getIssueType() == null && detail.getAssignee() == null &&
                        detail.getPriority() == null && detail.getState() == null && detail.getSummary() == null && detail.getCustomFieldValues().size() == 0;

            }
        }
        return false;
    }

    public static class Detail {
        private final String issueType;
        private final String priority;
        private final String summary;
        private final User assignee;
        private final Collection<ProjectComponent> components;
        private final String oldState;
        private final String state;
        private final boolean reranked;
        private final Map<Long, String> customFieldValues;

        private Detail(String issueType, String priority, String summary, User assignee, Collection<ProjectComponent> components,
                       String oldState, String state, boolean reranked, Map<Long, String> customFieldValues) {
            this.summary = summary;
            this.assignee = assignee;
            this.components = components;
            this.issueType = issueType;
            this.priority = priority;
            this.oldState = oldState;
            this.state = state;
            this.reranked = reranked;
            this.customFieldValues = customFieldValues != null ? customFieldValues : Collections.emptyMap();
        }

        public String getIssueType() {
            return issueType;
        }

        public String getPriority() {
            return priority;
        }

        public String getSummary() {
            return summary;
        }

        public User getAssignee() {
            return assignee;
        }

        public Collection<ProjectComponent> getComponents() {
            return components;
        }

        public String getOldState() {
            return oldState;
        }

        public String getState() {
            return state;
        }

        public boolean isReranked() {
            return reranked;
        }

        public Map<Long, String> getCustomFieldValues() {
            return customFieldValues;
        }
    }

    public enum Type {
        /** The issue was created */
        CREATE,
        /** The issue was updated */
        UPDATE,
        /** The issue was deleted */
        DELETE
    }

    /**
     * Used during an update event to indicate that the assignee was set to unassigned
     */
    public static final User UNASSIGNED = new User() {
        public long getDirectoryId() {
            return 0;
        }

        public boolean isActive() {
            return false;
        }

        public String getEmailAddress() {
            return "";
        }

        public String getDisplayName() {
            return Constants.UNASSIGNED;
        }

        public int compareTo(User user) {
            return -1;
        }

        public String getName() {
            return Constants.UNASSIGNED;
        }
    };
}
