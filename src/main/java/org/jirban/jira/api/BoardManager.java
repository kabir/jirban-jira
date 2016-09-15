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
package org.jirban.jira.api;

import java.util.Set;

import org.jirban.jira.impl.JirbanIssueEvent;
import org.jirban.jira.impl.JirbanRankEvent;
import org.jirban.jira.impl.config.CustomFieldConfig;

import com.atlassian.jira.issue.search.SearchException;
import com.atlassian.jira.user.ApplicationUser;

/**
 * @author Kabir Khan
 */
public interface BoardManager {
    /**
     * Gets the json for a board populated with issues
     *
     * @param user the logged in user
     * @param backlog if {@true} we will include issues belonging to the backlog states
     * @param code the code of the board
     * @return the board in json format
     * @throws SearchException
     */
    String getBoardJson(ApplicationUser user, boolean backlog, String code) throws SearchException;

    /**
     * Deletes a board
     * @param user the logged in user
     * @param code the id of the board to delete
     */
    void deleteBoard(ApplicationUser user, String code);

    /**
     * Checks whether there are any boards which has the passed in {@code projectCode} as one of the board projects.
     *
     * @param projectCode the project code
     * @return {@code true} if there are boards
     */
    boolean hasBoardsForProjectCode(String projectCode);

    /**
     * Handles an event from the underlying Jira instance to create, delete, update issues on the affected boards
     *
     * @param event the event
     */
    void handleEvent(JirbanIssueEvent event);

    void handleRankEvent(JirbanRankEvent rankEvent);

    /**
     * Gets the changes for a board. The client passes in their view id, and the delta is passed back to the client in
     * json format so they can apply it to their own model.
     *
     * @param user the logged in user
     * @param backlog if {@true} we will include changes to issues belonging to the backlog states
     * @param code the board code
     * @param viewId the view id of the client.
     * @return the json containing the changes
     */
    String getChangesJson(ApplicationUser user, boolean backlog, String code, int viewId) throws SearchException;

    /**
     * If one or more boards for the project is set up to use the custom field, we return the id of the custom field.
     * If none of the projects are configured to use the custom field, we return null.
     *
     * @param projectCode the project code
     * @param jiraCustomFieldName the custom field name. Note that this is the name of the field in Jira, not in the Jirban config
     * @return the custom field configs on boards involving the project, or an empty set if no boards are set up to use a custom field for {@code jiraCustomFieldName}
     */
    Set<CustomFieldConfig> getCustomFieldsForUpdateEvent(String projectCode, String jiraCustomFieldName);

    /**
     * Gets all the possible custom field configurations for a created issue
     *
     * @param projectCode the project code
     * @return the custom field configs on boards involving the issue.
     */
    Set<CustomFieldConfig> getCustomFieldsForCreateEvent(String projectCode);

}
