package org.jirban.jira.impl;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * @author Kabir Khan
 */
public class JirbanRankEvent {
    final Set<String> issues;
    final String beforeKey;
    final String afterKey;

    private JirbanRankEvent(Set<String> issues, String afterKey, String beforeKey) {
        this.issues = Collections.unmodifiableSet(issues);
        this.beforeKey = beforeKey;
        this.afterKey = afterKey;
    }

    public Set<String> getIssues() {
        return issues;
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
        return new JirbanRankEvent(newIssues, afterKey, beforeKey);
    }

    public static JirbanRankEvent create(List<String> issues, String afterKey, String beforeKey) {
        Set<String> issuesSet = new LinkedHashSet<>();
        issues.forEach(s -> issuesSet.add(s));
        return new JirbanRankEvent(issuesSet, afterKey, beforeKey);
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
