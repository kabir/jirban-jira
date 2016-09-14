package org.jirban.jira.impl;

import java.util.Collections;
import java.util.List;

/**
 * @author Kabir Khan
 */
public class JirbanRankEvent {
    final List<String> issues;
    final String beforeKey;
    final String afterKey;

    private JirbanRankEvent(List<String> issues, String beforeKey, String afterKey) {
        this.issues = Collections.unmodifiableList(issues);
        this.beforeKey = beforeKey;
        this.afterKey = afterKey;
    }

    public List<String> getIssues() {
        return issues;
    }

    public String getBeforeKey() {
        return beforeKey;
    }

    public String getAfterKey() {
        return afterKey;
    }

    public static JirbanRankEvent create(List<String> issues, String beforeKey, String afterKey) {
        return new JirbanRankEvent(issues, beforeKey, afterKey);
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
