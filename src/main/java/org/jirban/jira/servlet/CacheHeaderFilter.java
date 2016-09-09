package org.jirban.jira.servlet;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * @author Kabir Khan
 */
public class CacheHeaderFilter implements Filter {

    private final String etagHex = Long.toHexString(System.currentTimeMillis());
    private static final long MAX_AGE = TimeUnit.DAYS.toSeconds(30); //6 hours max age

    public CacheHeaderFilter() {
    }

    @Override
    public void init(FilterConfig filterConfig) throws ServletException {
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
        HttpServletRequest req = (HttpServletRequest)request;
        HttpServletResponse resp = (HttpServletResponse)response;
        String ifNoneMatch = req.getHeader("if-none-match");
        if (ifNoneMatch != null) {
            //If this header is there, it means the browser has it cached. Webpack gives all the js and other files
            //a unique hash
            if (!etagHex.equals(ifNoneMatch)) {
                //The etag is different so update it for the client (not really necessary).
                resp.addHeader("ETag", etagHex);
            }
            resp.setStatus(304);
            return;
        }

        resp.addHeader("ETag", etagHex);
        resp.addHeader("Cache-Control", "max-age=" + MAX_AGE);
        chain.doFilter(request, resp);
    }

    @Override
    public void destroy() {

    }
}


