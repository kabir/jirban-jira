package org.jirban.jira.impl;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.jirban.jira.JirbanLogger;

/**
 * @author Kabir Khan
 */
public class JirbanRankEvent {
    final Set<String> issues;
    final String projectCode;
    final String beforeKey;
    final String afterKey;

    private JirbanRankEvent(Set<String> issues, String projectCode, String afterKey, String beforeKey) {
        this.issues = Collections.unmodifiableSet(issues);
        this.projectCode = projectCode;
        this.beforeKey = beforeKey;
        this.afterKey = afterKey;
    }


    public Set<String> getIssues() {
        return issues;
    }

    public String getProjectCode() {
        return projectCode;
    }

    public String getBeforeKey() {
        return beforeKey;
    }

    public String getAfterKey() {
        return afterKey;
    }

    JirbanRankEvent copyForRelevantIssues(Set<String> relevantIssues) {
        if (issues.size() == relevantIssues.size()) {
            return this;
        }
        Set<String> newIssues = new LinkedHashSet<>();
        for (String key : issues) {
            if (relevantIssues.contains(key)) {
                newIssues.add(key);
            }
        }
        return new JirbanRankEvent(newIssues, projectCode, afterKey, beforeKey);
    }

    public static JirbanRankEvent create(List<String> issues, String afterKey, String beforeKey) {
        Set<String> issuesSet = new LinkedHashSet<>();
        issues.forEach(s -> issuesSet.add(s));

        String projectCode = null;
        if (beforeKey != null) {
            projectCode = getProjectCode(beforeKey);
        }
        if (afterKey != null) {
            if (projectCode != null) {
                if (!projectCode.equals(getProjectCode(afterKey))) {
                    JirbanLogger.LOGGER.warn("Currently it is not supported to mix projects when ranking {} {} {}", issues, afterKey, beforeKey);
                    return null;
                }
            } else {
                projectCode = getProjectCode(afterKey);
            }
        }
        if (projectCode == null) {
            JirbanLogger.LOGGER.warn("Currently it is not supported to mix projects when ranking {} {} {}", issues, afterKey, beforeKey);
            return null;
        }

        for (String key : issues) {
            if (!projectCode.equals(getProjectCode(key))) {
                JirbanLogger.LOGGER.warn("Currently it is not supported to mix projects when ranking {} {} {}", issues, afterKey, beforeKey);
                return null;
            }
        }
        return new JirbanRankEvent(issuesSet, projectCode, afterKey, beforeKey);
    }

    private static String getProjectCode(String issueKey) {
        return issueKey.substring(0, issueKey.indexOf('-'));
    }

    @Override
    public String toString() {
        return "JirbanRankEvent{" +
                "issues=" + issues +
                ", beforeKey='" + beforeKey + '\'' +
                ", afterKey='" + afterKey + '\'' +
                '}';
    }
}
