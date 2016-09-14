package org.jirban.jira.servlet;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletInputStream;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletRequestWrapper;

import org.jboss.dmr.ModelNode;
import org.jboss.dmr.ModelType;
import org.jirban.jira.JirbanLogger;
import org.jirban.jira.impl.Constants;
import org.jirban.jira.impl.JirbanRankEvent;
import org.springframework.beans.factory.annotation.Autowired;

import com.atlassian.event.api.EventPublisher;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;

/**
 * Intercepts the calls to rank issues and
 * @author Kabir Khan
 */
public class RankIssueFilter implements Filter {

    private final String RANK_1_0 = "/rest/greenhopper/1.0/rank";

    private final String API_RANK_1_0 = "/rest/greenhopper/1.0/rank";
    private final String API_RANK_BEFORE_1_0 = "/rest/greenhopper/1.0/api/rank/before";
    private final String API_RANK_AFTER_1_0 = "/rest/greenhopper/1.0/api/rank/after";
    private final String RANK_GLOBAL_FIRST_1_0 = "/rest/greenhopper/1.0/rank/global/first";
    private final String RANK_GLOBAL_LAST_1_0 = "/rest/greenhopper/1.0/rank/global/last";

    @ComponentImport
    private final EventPublisher eventPublisher;

    @Autowired
    public RankIssueFilter(EventPublisher eventPublisher) {
        this.eventPublisher = eventPublisher;
    }


    @Override
    public void init(FilterConfig filterConfig) throws ServletException {

    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
        final HttpServletRequest req = (HttpServletRequest)request;
        String uri = req.getRequestURI();
        if (uri.endsWith("/")) {
            uri.substring(0, uri.length() - 1);
        }
        if (uri.endsWith(API_RANK_1_0)) {

            parseBodyEmitEventAndDoFilter(req, response, chain, uri, modelNode -> {
                return JirbanRankEvent.create(
                        modelNodeListToStringList(modelNode.get(Constants.RANK_ISSUE_KEYS)),
                        modelNodeToString(modelNode.get(Constants.RANK_BEFORE_KEY)),
                        modelNodeToString(modelNode.get(Constants.RANK_AFTER_KEY)));
            });
        } else {
            JirbanLogger.LOGGER.warn("RankIssueFilter ignoring uri {}", uri);
            chain.doFilter(request, response);
        }
    }

    private void parseBodyEmitEventAndDoFilter(HttpServletRequest req, ServletResponse response, FilterChain chain,
                                               String uri, Function<ModelNode, JirbanRankEvent> eventFactory) throws IOException, ServletException {
        ModelNode modelNode = null;
        try {
            //We need to check the request body, which will also be needed later, so wrap it
            final byte[] bodyBytes = toByteArray(req.getInputStream());

            modelNode = ModelNode.fromJSONStream(new ByteArrayInputStream(bodyBytes));
            System.out.println(modelNode);
            HttpServletRequestWrapper wrapper = new JirbanHttpServletRequestWrapper(req, bodyBytes);

            JirbanRankEvent rankEvent = eventFactory.apply(modelNode);
            eventPublisher.publish(rankEvent);
            chain.doFilter(wrapper, response);
        } catch (Exception e) {
            JirbanLogger.LOGGER.error("An error happened processing the rank event {} {}", uri, modelNode, e);
        }

    }

    @Override
    public void destroy() {

    }

    private byte[] toByteArray(InputStream in) throws IOException {
        byte[] buffer = new byte[4096];
        int bytesRead;
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        while ((bytesRead = in.read(buffer)) != -1)
        {
            output.write(buffer, 0, bytesRead);
        }
        return output.toByteArray();
    }

    private List<String> modelNodeListToStringList(ModelNode node) {
        List<String> result = new ArrayList<>();
        if (node.getType() != ModelType.LIST) {
            return result;
        }
        for (ModelNode entry : node.asList()) {
            result.add(entry.asString());
        }
        return result;
    }

    private String modelNodeToString(ModelNode node) {
        if (!node.isDefined()) {
            return null;
        }
        return node.asString();
    }

    private static class JirbanHttpServletRequestWrapper extends HttpServletRequestWrapper {
        private volatile byte[] bodyBytes;
        private volatile ServletInputStream inputStream;
        private volatile BufferedReader bufferedReader;

        public JirbanHttpServletRequestWrapper(HttpServletRequest request, byte[] bodyBytes) {
            super(request);
            this.bodyBytes = bodyBytes;
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            if (bufferedReader != null) {
                throw new IllegalStateException("getReader() has already been called");
            }
            if (inputStream != null) {
                return inputStream;
            }
            inputStream = new JirbanServletInputStreamWrapper(new ByteArrayInputStream(bodyBytes));
            bodyBytes = null;
            return inputStream;
        }

        @Override
        public BufferedReader getReader() throws IOException {
            if (inputStream != null) {
                throw new IllegalStateException("getInputStream() has already been called");
            }
            if (bufferedReader != null) {
                return bufferedReader;
            }
            bufferedReader = new BufferedReader(new InputStreamReader(new ByteArrayInputStream(bodyBytes)));
            bodyBytes = null;
            return bufferedReader;
        }
    }

    private static class JirbanServletInputStreamWrapper extends ServletInputStream {
        private volatile InputStream delegate;

        public JirbanServletInputStreamWrapper(ByteArrayInputStream delegate) {
            this.delegate = delegate;
        }

        @Override
        public int read() throws IOException {
            checkOpen();
            return delegate.read();
        }

        @Override
        public int read(byte[] b) throws IOException {
            checkOpen();
            return delegate.read(b);
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            checkOpen();
            return delegate.read(b, off, len);
        }

        @Override
        public long skip(long n) throws IOException {
            checkOpen();
            return delegate.skip(n);
        }

        @Override
        public int available() throws IOException {
            checkOpen();
            return delegate.available();
        }

        @Override
        public void mark(int readlimit) {
            if (delegate != null) {
                delegate.mark(readlimit);
            }
        }

        @Override
        public void reset() throws IOException {
            checkOpen();
            delegate.reset();
        }

        @Override
        public boolean markSupported() {
            if (delegate == null) {
                return false;
            }
            return delegate.markSupported();
        }

        @Override
        public void close() throws IOException {
            delegate.close();
            delegate = null;
        }


        private void checkOpen() throws IOException {
            if (delegate == null) {
                throw new IOException("The inputstream was already closed");
            }
        }
    }
}
