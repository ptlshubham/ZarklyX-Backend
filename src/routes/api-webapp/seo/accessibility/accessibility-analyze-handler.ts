import puppeteer, { Browser, Page } from 'puppeteer';
import { generateSeoIssues } from '../../../../services/gemini-seo-issues';
import {appendAnalyzeState} from '../storeinfile/storeFile-handler';
interface ViewportMeta {
    exists: boolean;
    content: string;
    isProperlyConfigured: boolean;
    initialScale: boolean;
    userScalable: boolean;
    issues: string[];
}

interface MediaQueries {
    count: number;
    approach: 'mobile-first' | 'desktop-first' | 'unknown';
    orientationSupport: boolean;
}

interface Responsiveness {
    layoutAdaptation: 'excellent' | 'good' | 'basic' | 'poor';
    imageScaling: 'responsive' | 'partially-responsive' | 'fixed';
    typographyScaling: 'fluid' | 'fixed' | 'mixed';
    componentBehavior: 'adaptive' | 'static' | 'mixed';
    contentRearrangement: boolean;
    horizontalScroll: boolean;
}

interface TapTargets {
    averageSize: string;
    minSize: string;
    spacing: string;
    hitAreaExpansion: boolean;
    issues: string[];
}

interface PerformanceMetrics {
    timeToFirstByte: number;
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    cumulativeLayoutShift: number;
    speedIndex?: number;
}

interface AnalysisResult {
    accessibilityScore: number;
    mobileUsabilityScore: number;
    touchTargetScore: number;
    readabilityScore: number;
    
    fluidLayout: { value: boolean; impact: string };
    gridSystem: { value: string; impact: string };
    mediaQueriesCount: { value: number; impact: string };
    orientationSupport: { value: boolean; impact: string };
    
    layoutAdaptation: { status: string; impact: string };
    imageScaling: { status: string; impact: string };
    typographyScaling: { status: string; impact: string };
    componentBehavior: { status: string; impact: string };
    contentRearrangement: { status: string; impact: string };
    horizontalScroll: { status: string; impact: string };
    
    viewportExists: { value: boolean; impact: string };
    viewportContent: { value: string; impact: string };
    properlyConfigured: { value: boolean; impact: string };
    userScalableIssue: { value: boolean; impact: string };
    
    swipeNavigation: { status: string; impact: string };
    pinchZoom: { status: string; impact: string };
    doubleTapZoom: { status: string; impact: string };
    longPressSupport: { status: string; impact: string };
    smoothScrolling: { status: string; impact: string };
    momentumScrolling: { status: string; impact: string };
    scrollSnap: { status: string; impact: string };
    
    maxZoomScale: { status: string; impact: string };
    viewportRestriction: { status: string; impact: string };
    touchHighlight: { status: string; impact: string };
    activeStates: { status: string; impact: string };
    
    visualFeedback: { status: string; impact: string };
    hapticFeedback: { status: string; impact: string };
    interactionScore: { status: number; impact: string };
    
    accessibilityDesign: {
        viewports: {
            supported: string[];
            breakpoints: Record<string, string>;
            fluidLayout: boolean;
            gridSystem: string;
            mediaQueries: MediaQueries;
        };
        responsiveness: Responsiveness;
        score: number;
    };
    mobileOptimization: {
        viewport: ViewportMeta;
        mobileFriendly: {
            tapTargets: TapTargets;
            fontScaling: {
                baseSize: string;
                relativeUnits: boolean;
                readability: string;
                lineHeight: number;
                contrastRatio: string;
            };
            contentWidth: {
                fitsViewport: boolean;
                overflow: string;
                horizontalScroll: boolean;
                maxContentWidth: string;
            };
            loadingSpeed: {
                firstContentfulPaint: string;
                timeToInteractive: string;
                score: number;
            };
        };
        score: number;
    };
    touchFriendly: {
        tapTargets: TapTargets;
        touchGestures: {
            swipeNavigation: boolean;
            pinchZoom: boolean;
            doubleTapZoom: boolean;
            longPressSupport: boolean;
            gestureConflicts: boolean;
        };
        scrollBehavior: {
            smoothScrolling: boolean;
            momentumScrolling: boolean;
            scrollSnap: boolean;
            overscrollBehavior: string;
        };
        zoomSupport: {
            pinchToZoom: boolean;
            doubleTapZoom: boolean;
            maximumScale: number;
            viewportRestrictions: boolean;
        };
        feedback: {
            touchHighlights: boolean;
            activeStates: boolean;
            visualFeedback: string;
            hapticFeedback: string;
        };
        score: number;
    };
    // performance: {
    //     coreWebVitals: {
    //         lcp: string;
    //         fid: string;
    //         cls: string;
    //         inp: string;
    //     };
    //     loading: {
    //         timeToFirstByte: string;
    //         firstContentfulPaint: string;
    //         largestContentfulPaint: string;
    //         speedIndex: string;
    //     };
    // };
}

interface AnalyzerContext {
    browser: Browser | null;
    page: Page | null;
}

function createAnalyzerContext(): AnalyzerContext {
    return {
        browser: null,
        page: null
    };
}

async function initializeBrowser(ctx: AnalyzerContext): Promise<void> {
    if (ctx.browser && ctx.page) {
        return;
    }
    
    ctx.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    ctx.page = await ctx.browser.newPage();
    await ctx.page.setViewport({ width: 375, height: 667, isMobile: true });
}

async function analyzeMobileAccessibility(url: string): Promise<AnalysisResult> {
    const ctx = createAnalyzerContext();
    await initializeBrowser(ctx);

    await ctx.page!.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Execute analysis in browser context
    const analysisScript = `
    (function() {
        var getStyle = function(element, property) {
            return window.getComputedStyle(element).getPropertyValue(property);
        };

        var viewportMeta = document.querySelector('meta[name="viewport"]');
        var hasViewport = !!viewportMeta;
        var viewportContent = viewportMeta ? viewportMeta.getAttribute('content') || '' : '';

        var breakpoints = new Set();
        var mediaQueryCount = 0;
        var hasMinWidth = false;
        var hasMaxWidth = false;
        var hasOrientation = false;

        Array.from(document.styleSheets).forEach(function(sheet) {
            try {
                var rules = Array.from(sheet.cssRules || []);
                rules.forEach(function(rule) {
                    if (rule.type === CSSRule.MEDIA_RULE) {
                        var mediaRule = rule;
                        mediaQueryCount++;
                        var mediaText = mediaRule.media.mediaText;

                        if (mediaText.includes('min-width')) hasMinWidth = true;
                        if (mediaText.includes('max-width')) hasMaxWidth = true;
                        if (mediaText.includes('orientation')) hasOrientation = true;

                        var matches = mediaText.match(/(\\\\d+)px/g) || [];
                        matches.forEach(function(match) {
                            var value = parseInt(match);
                            if (!isNaN(value)) breakpoints.add(value);
                        });
                    }
                });
            } catch (e) {}
        });

        var approach = 'unknown';
        if (hasMinWidth && !hasMaxWidth) approach = 'mobile-first';
        if (hasMaxWidth && !hasMinWidth) approach = 'desktop-first';

        var containers = Array.from(document.querySelectorAll('div, section, main, article, header, footer'));
        var containerWidths = containers.slice(0, 50).map(function(el) { return getStyle(el, 'width'); });
        var hasFluidLayout = containerWidths.some(function(width) {
            return width.includes('%') || width.includes('vw') || width.includes('auto');
        });

        var bodyDisplay = getStyle(document.body, 'display');
        var hasGrid = bodyDisplay.includes('grid') ||
            Array.from(document.querySelectorAll('*')).slice(0, 100).some(function(el) {
                return getStyle(el, 'display').includes('grid');
            });
        var hasFlexbox = bodyDisplay.includes('flex') ||
            Array.from(document.querySelectorAll('*')).slice(0, 100).some(function(el) {
                return getStyle(el, 'display').includes('flex');
            });

        var gridSystem = hasGrid ? 'CSS Grid' : hasFlexbox ? 'Flexbox' : 'Traditional';
        var hasHorizontalScroll = document.documentElement.scrollWidth > window.innerWidth;

        var interactiveElements = Array.from(document.querySelectorAll(
            'a, button, input[type="button"], input[type="submit"], [role="button"], [tabindex]'
        )).slice(0, 50);

        var tapTargetSizes = [];
        var tapTargetIssues = [];
        var tapTargetSpacings = [];

        interactiveElements.forEach(function(el, index) {
            var rect = el.getBoundingClientRect();
            var area = rect.width * rect.height;
            tapTargetSizes.push(area);

            if (rect.width < 44 || rect.height < 44) {
                var tagName = el.tagName.toLowerCase();
                var id = el.id ? '#' + el.id : '';
                tapTargetIssues.push(tagName + id + ' (' + Math.round(rect.width) + '×' + Math.round(rect.height) + 'px)');
            }

            if (index < interactiveElements.length - 1) {
                var nextRect = interactiveElements[index + 1].getBoundingClientRect();
                var spacing = Math.abs(nextRect.top - rect.bottom);
                if (spacing > 0 && spacing < 100) {
                    tapTargetSpacings.push(spacing);
                }
            }
        });

        var averageTapSize = tapTargetSizes.length > 0
            ? Math.round(Math.sqrt(tapTargetSizes.reduce(function(a, b) { return a + b; }, 0) / tapTargetSizes.length))
            : 0;

        var averageSpacing = tapTargetSpacings.length > 0
            ? Math.round(tapTargetSpacings.reduce(function(a, b) { return a + b; }, 0) / tapTargetSpacings.length)
            : 8;

        var textElements = Array.from(document.querySelectorAll(
            'p, h1, h2, h3, h4, h5, h6, span, div'
        )).slice(0, 50);

        var fontSizes = [];
        var hasRelativeUnits = false;
        var lineHeights = [];
        var contrastRatios = [];

        textElements.forEach(function(el) {
            var fontSize = getStyle(el, 'font-size');
            var numValue = parseFloat(fontSize);
            if (!isNaN(numValue)) fontSizes.push(numValue);

            if (fontSize.includes('em') || fontSize.includes('rem') || fontSize.includes('%')) {
                hasRelativeUnits = true;
            }

            var lineHeight = getStyle(el, 'line-height');
            var lineHeightValue = parseFloat(lineHeight);
            if (!isNaN(lineHeightValue) && !isNaN(numValue) && numValue > 0) {
                lineHeights.push(lineHeightValue / numValue);
            }

            var color = getStyle(el, 'color');
            var bgColor = getStyle(el, 'background-color');
            var colorMatch = color.match(/\\d+/g);
            var bgMatch = bgColor.match(/\\d+/g);
            
            if (colorMatch && bgMatch && colorMatch.length >= 3 && bgMatch.length >= 3) {
                var colorLum = (0.299 * parseInt(colorMatch[0]) + 0.587 * parseInt(colorMatch[1]) + 0.114 * parseInt(colorMatch[2])) / 255;
                var bgLum = (0.299 * parseInt(bgMatch[0]) + 0.587 * parseInt(bgMatch[1]) + 0.114 * parseInt(bgMatch[2])) / 255;
                var ratio = colorLum > bgLum 
                    ? (colorLum + 0.05) / (bgLum + 0.05)
                    : (bgLum + 0.05) / (colorLum + 0.05);
                contrastRatios.push(ratio);
            }
        });

        var averageFontSize = fontSizes.length > 0
            ? Math.round(fontSizes.reduce(function(a, b) { return a + b; }, 0) / fontSizes.length)
            : 16;

        var averageLineHeight = lineHeights.length > 0
            ? parseFloat((lineHeights.reduce(function(a, b) { return a + b; }, 0) / lineHeights.length).toFixed(2))
            : 1.5;

        var averageContrast = contrastRatios.length > 0
            ? (contrastRatios.reduce(function(a, b) { return a + b; }, 0) / contrastRatios.length).toFixed(1)
            : '4.5';

        var htmlStyle = getStyle(document.documentElement, 'scroll-behavior');
        var hasSmoothScroll = htmlStyle === 'smooth' ||
            Array.from(document.querySelectorAll('[style]')).some(function(el) {
                return (el.getAttribute('style') || '').includes('scroll-behavior: smooth');
            });

        var hasScrollSnap = getStyle(document.documentElement, 'scroll-snap-type') !== 'none' ||
            Array.from(document.querySelectorAll('*')).slice(0, 50).some(function(el) {
                return getStyle(el, 'scroll-snap-type') !== 'none';
            });

        var hasMomentumScrolling = getStyle(document.body, '-webkit-overflow-scrolling') === 'touch' ||
            Array.from(document.querySelectorAll('*')).slice(0, 50).some(function(el) {
                return getStyle(el, '-webkit-overflow-scrolling') === 'touch';
            });

        var hasTouchHighlight = getStyle(document.body, '-webkit-tap-highlight-color') !== 'rgba(0, 0, 0, 0)' ||
            Array.from(document.querySelectorAll('a, button')).slice(0, 20).some(function(el) {
                return getStyle(el, '-webkit-tap-highlight-color') !== 'rgba(0, 0, 0, 0)';
            });

        var hasActiveStates = false;
        try {
            var styles = document.styleSheets;
            for (var i = 0; i < Math.min(styles.length, 10); i++) {
                try {
                    var rules = styles[i].cssRules || [];
                    for (var j = 0; j < rules.length; j++) {
                        var rule = rules[j];
                        if (rule.selectorText && (rule.selectorText.includes(':active') || rule.selectorText.includes(':hover'))) {
                            hasActiveStates = true;
                            break;
                        }
                    }
                } catch (e) {}
                if (hasActiveStates) break;
            }
        } catch (e) {
            hasActiveStates = false;
        }

        var hasLongPress = false;
        try {
            hasLongPress = document.querySelector('[contextmenu]') !== null ||
                document.querySelector('[oncontextmenu]') !== null;
        } catch (e) {
            hasLongPress = false;
        }

        var hasSwipeNav = false;
        try {
            var carousels = Array.from(document.querySelectorAll('[class*="carousel"], [class*="slider"], [class*="swipe"]'));
            hasSwipeNav = carousels.length > 0;
        } catch (e) {
            hasSwipeNav = false;
        }

        var hasGestureConflicts = viewportContent.includes('user-scalable=no') && hasSwipeNav;

        var maxScale = 5.0;
        var maxScaleMatch = viewportContent.match(/maximum-scale=([\\d.]+)/);
        if (maxScaleMatch) {
            maxScale = parseFloat(maxScaleMatch[1]) || 5.0;
        }

        var maxContentWidth = '100%';
        var mainContent = document.querySelector('main, .container, .content, #content, [role="main"]');
        if (mainContent) {
            var maxWidth = getStyle(mainContent, 'max-width');
            if (maxWidth && maxWidth !== 'none') {
                maxContentWidth = maxWidth;
            }
        }

        var responsiveImages = Array.from(document.querySelectorAll('img')).filter(function(img) {
            return img.hasAttribute('srcset') || img.hasAttribute('sizes');
        }).length;

        var calculateResponsiveScore = function() {
            var score = hasViewport ? 70 : 30;
            if (mediaQueryCount > 3) score += 10;
            if (hasFluidLayout) score += 10;
            if (gridSystem !== 'Traditional') score += 5;
            if (!hasHorizontalScroll) score += 5;
            if (responsiveImages > 0) score += 5;
            return Math.min(score, 100);
        };

        var calculateMobileScore = function() {
            var score = hasViewport ? 60 : 20;
            var properViewport = hasViewport &&
                viewportContent.includes('width=device-width') &&
                viewportContent.includes('initial-scale=1');
            if (properViewport) score += 20;
            if (tapTargetIssues.length === 0) score += 10;
            if (hasRelativeUnits) score += 5;
            if (averageFontSize >= 16) score += 5;
            return Math.min(score, 100);
        };

        var calculateTouchScore = function() {
            var score = 50;
            if (tapTargetIssues.length === 0) score += 20;
            if (hasSmoothScroll) score += 10;
            var canZoom = !viewportContent.includes('user-scalable=no');
            if (canZoom) score += 20;
            return Math.min(score, 100);
        };

        var calculateAccessibilityScore = function() {
            var score = 70;
            if (averageFontSize >= 16) score += 15;
            if (tapTargetIssues.length === 0) score += 15;
            return Math.min(score, 100);
        };

        var calculateReadabilityScore = function() {
            var score = 50;
            if (averageFontSize >= 16) score += 25;
            if (hasRelativeUnits) score += 25;
            return Math.min(score, 100);
        };

        var calculateInteractionScore = function() {
            var score = 60;
            if (hasSmoothScroll) score += 20;
            if (hasScrollSnap) score += 20;
            return Math.min(score, 100);
        };

        var sortedBreakpoints = Array.from(breakpoints).sort(function(a, b) { return a - b; });
        var breakpointRanges = {};

        if (sortedBreakpoints.length > 0) {
            breakpointRanges.mobile = '0px - ' + (sortedBreakpoints[0] - 1) + 'px';
            for (var i = 0; i < sortedBreakpoints.length - 1; i++) {
                var label = i === 0 ? 'tablet' : i === 1 ? 'desktop' : 'breakpoint' + (i + 1);
                breakpointRanges[label] = sortedBreakpoints[i] + 'px - ' + (sortedBreakpoints[i + 1] - 1) + 'px';
            }
            var lastLabel = sortedBreakpoints.length === 1 ? 'tablet+' : 'largeDesktop';
            breakpointRanges[lastLabel] = sortedBreakpoints[sortedBreakpoints.length - 1] + 'px+';
        }

        var layoutAdaptation;
        if (mediaQueryCount > 5 && hasFluidLayout) layoutAdaptation = 'excellent';
        else if (mediaQueryCount > 2) layoutAdaptation = 'good';
        else if (mediaQueryCount > 0) layoutAdaptation = 'basic';
        else layoutAdaptation = 'poor';

        var imageScaling = responsiveImages > 5 ? 'responsive' :
                responsiveImages > 0 ? 'partially-responsive' : 'fixed';

        var typographyScaling = hasRelativeUnits ? 'fluid' : 'fixed';
        var componentBehavior = hasGrid || hasFlexbox ? 'adaptive' : 'static';
        var minTapSize = tapTargetSizes.length > 0 
            ? Math.round(Math.min.apply(Math, tapTargetSizes.map(function(s) { return Math.sqrt(s); }))) 
            : 0;

        return {
            viewportAnalysis: {
                exists: hasViewport,
                content: viewportContent,
                isProperlyConfigured: hasViewport && /width=device-width/.test(viewportContent),
                initialScale: /initial-scale=1/.test(viewportContent),
                userScalable: !/user-scalable=no/.test(viewportContent),
                issues: hasViewport ? [] : ['Missing viewport meta tag']
            },
            mediaQueries: {
                count: mediaQueryCount,
                approach: approach,
                orientationSupport: hasOrientation
            },
            layout: {
                fluidLayout: hasFluidLayout,
                gridSystem: gridSystem,
                horizontalScroll: hasHorizontalScroll
            },
            tapTargets: {
                averageSize: averageTapSize + 'px',
                minSize: minTapSize + 'px',
                spacing: averageSpacing + 'px',
                hitAreaExpansion: interactiveElements.some(function(el) {
                    return window.getComputedStyle(el).cursor === 'pointer';
                }),
                issues: tapTargetIssues.slice(0, 5)
            },
            typography: {
                baseSize: averageFontSize + 'px',
                relativeUnits: hasRelativeUnits,
                readability: averageFontSize >= 16 ? 'good' : averageFontSize >= 14 ? 'adequate' : 'poor',
                lineHeight: averageLineHeight,
                contrastRatio: averageContrast + ':1'
            },
            scrollBehavior: {
                smoothScrolling: hasSmoothScroll,
                scrollSnap: hasScrollSnap,
                overscrollBehavior: getStyle(document.documentElement, 'overscroll-behavior') || 'auto',
                momentumScrolling: hasMomentumScrolling
            },
            touchBehavior: {
                touchHighlight: hasTouchHighlight,
                activeStates: hasActiveStates,
                longPress: hasLongPress,
                swipeNav: hasSwipeNav,
                gestureConflicts: hasGestureConflicts,
                maxScale: maxScale
            },
            contentMeasurements: {
                maxContentWidth: maxContentWidth
            },
            breakpointRanges: breakpointRanges,
            layoutAdaptation: layoutAdaptation,
            imageScaling: imageScaling,
            typographyScaling: typographyScaling,
            componentBehavior: componentBehavior,
            contentRearrangement: mediaQueryCount > 0,
            scores: {
                responsive: calculateResponsiveScore(),
                mobile: calculateMobileScore(),
                touch: calculateTouchScore(),
                accessibility: calculateAccessibilityScore(),
                readability: calculateReadabilityScore(),
                interaction: calculateInteractionScore()
            }
        };
    })()
    `;
    
    const result: any = await ctx.page!.evaluate(analysisScript);

    const performanceMetrics = await ctx.page!.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const paint = performance.getEntriesByType('paint');
        
        const fcp = paint.find(entry => entry.name === 'first-contentful-paint');
        const lcp = performance.getEntriesByType('largest-contentful-paint').slice(-1)[0];
        
        const layoutShifts = performance.getEntriesByType('layout-shift') as any[];
        const cls = layoutShifts.reduce((sum, entry) => sum + (entry.value || 0), 0);
        
        return {
            timeToFirstByte: navigation ? navigation.responseStart - navigation.requestStart : 0,
            firstContentfulPaint: fcp ? fcp.startTime : 0,
            largestContentfulPaint: lcp ? (lcp as any).startTime : 0,
            cumulativeLayoutShift: cls,
            domContentLoaded: navigation ? navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart : 0,
            timeToInteractive: navigation ? navigation.domInteractive - navigation.fetchStart : 0
        };
    });

    const speedIndex = performanceMetrics.firstContentfulPaint + 
                       (performanceMetrics.largestContentfulPaint - performanceMetrics.firstContentfulPaint) * 0.5;

    const estimatedFID = performanceMetrics.timeToFirstByte > 600 ? 300 : 
                         performanceMetrics.timeToFirstByte > 300 ? 150 : 50;
    const estimatedINP = estimatedFID * 2;

    await closeBrowser(ctx);

    const finalResult: AnalysisResult = {
        accessibilityScore: result.scores.accessibility,
        mobileUsabilityScore: result.scores.mobile,
        touchTargetScore: Math.max(0, 100 - (result.tapTargets.issues.length * 10)),
        readabilityScore: result.scores.readability,
        
        fluidLayout: { value: result.layout.fluidLayout, impact: result.layout.fluidLayout ? 'Positive - Layout adapts to screen size' : 'Negative - Fixed layout may not adapt well' },
        gridSystem: { value: result.layout.gridSystem, impact: result.layout.gridSystem !== 'Traditional' ? 'Positive - Modern layout system' : 'Neutral - Traditional layout approach' },
        mediaQueriesCount: { value: result.mediaQueries.count, impact: result.mediaQueries.count > 3 ? 'Positive - Good responsive coverage' : 'Negative - Limited responsive breakpoints' },
        orientationSupport: { value: result.mediaQueries.orientationSupport, impact: result.mediaQueries.orientationSupport ? 'Positive - Handles orientation changes' : 'Neutral - No specific orientation handling' },
        
        layoutAdaptation: { status: result.layoutAdaptation, impact: 'Critical for responsive design' },
        imageScaling: { status: result.imageScaling, impact: 'Affects loading performance and display quality' },
        typographyScaling: { status: result.typographyScaling, impact: 'Important for readability across devices' },
        componentBehavior: { status: result.componentBehavior, impact: 'Determines how UI elements respond to screen changes' },
        contentRearrangement: { status: result.contentRearrangement ? 'supported' : 'not-supported', impact: 'Essential for optimal mobile experience' },
        horizontalScroll: { status: result.layout.horizontalScroll ? 'detected' : 'none', impact: result.layout.horizontalScroll ? 'Negative - Poor mobile UX' : 'Positive - Content fits viewport' },
        
        viewportExists: { value: result.viewportAnalysis.exists, impact: result.viewportAnalysis.exists ? 'Positive - Mobile optimization enabled' : 'Critical - Mobile optimization disabled' },
        viewportContent: { value: result.viewportAnalysis.content, impact: result.viewportAnalysis.content.includes('width=device-width') ? 'Positive - Proper configuration' : 'Negative - Improper configuration' },
        properlyConfigured: { value: result.viewportAnalysis.isProperlyConfigured, impact: 'Critical for mobile display' },
        userScalableIssue: { value: !result.viewportAnalysis.userScalable, impact: !result.viewportAnalysis.userScalable ? 'Negative - Accessibility issue' : 'Positive - Users can zoom' },
        
        swipeNavigation: { 
            status: result.touchBehavior.swipeNav ? 'detected' : 'not-detected', 
            impact: result.touchBehavior.swipeNav ? 'Positive - Enhanced navigation' : 'Neutral - Depends on implementation' 
        },
        pinchZoom: { 
            status: result.viewportAnalysis.userScalable ? 'enabled' : 'disabled', 
            impact: result.viewportAnalysis.userScalable ? 'Positive - Accessibility feature' : 'Negative - Accessibility barrier' 
        },
        doubleTapZoom: { 
            status: result.viewportAnalysis.userScalable ? 'enabled' : 'disabled', 
            impact: 'Important for accessibility' 
        },
        longPressSupport: { 
            status: result.touchBehavior.longPress ? 'detected' : 'not-detected', 
            impact: result.touchBehavior.longPress ? 'Positive - Enhanced interaction' : 'Neutral - Standard browser behavior' 
        },
        smoothScrolling: { 
            status: result.scrollBehavior.smoothScrolling ? 'enabled' : 'disabled', 
            impact: result.scrollBehavior.smoothScrolling ? 'Positive - Better UX' : 'Neutral - Standard scrolling' 
        },
        momentumScrolling: { 
            status: result.scrollBehavior.momentumScrolling ? 'enabled' : 'disabled', 
            impact: result.scrollBehavior.momentumScrolling ? 'Positive - Native mobile behavior' : 'Neutral - Standard scrolling' 
        },
        scrollSnap: { 
            status: result.scrollBehavior.scrollSnap ? 'enabled' : 'disabled', 
            impact: result.scrollBehavior.scrollSnap ? 'Positive - Enhanced scroll experience' : 'Neutral - Standard scrolling' 
        },
        
        maxZoomScale: { 
            status: result.viewportAnalysis.content.includes('maximum-scale') ? 'restricted' : 'unrestricted', 
            impact: result.viewportAnalysis.content.includes('maximum-scale') ? 'Negative - May limit accessibility' : 'Positive - Full zoom capability' 
        },
        viewportRestriction: { 
            status: !result.viewportAnalysis.userScalable || result.viewportAnalysis.content.includes('maximum-scale=1') ? 'restricted' : 'unrestricted', 
            impact: 'Affects user control and accessibility' 
        },
        touchHighlight: { 
            status: result.touchBehavior.touchHighlight ? 'custom' : 'browser-default', 
            impact: result.touchBehavior.touchHighlight ? 'Positive - Custom touch feedback' : 'Neutral - Standard touch feedback' 
        },
        activeStates: { 
            status: result.touchBehavior.activeStates ? 'present' : 'absent', 
            impact: result.touchBehavior.activeStates ? 'Positive - Visual feedback on interaction' : 'Negative - No visual feedback' 
        },
        
        visualFeedback: { 
            status: result.touchBehavior.activeStates ? 'immediate' : 'none', 
            impact: result.touchBehavior.activeStates ? 'Positive - Good user experience' : 'Negative - Poor user experience' 
        },
        hapticFeedback: { status: 'device-dependent', impact: 'Neutral - Depends on device capabilities' },
        interactionScore: { status: result.scores.interaction, impact: result.scores.interaction > 80 ? 'Excellent interaction design' : result.scores.interaction > 60 ? 'Good interaction design' : 'Needs improvement' },
        
        accessibilityDesign: {
            viewports: {
                supported: result.breakpointRanges ? Object.keys(result.breakpointRanges) : ['unknown'],
                breakpoints: result.breakpointRanges || {},
                fluidLayout: result.layout.fluidLayout,
                gridSystem: result.layout.gridSystem,
                mediaQueries: result.mediaQueries
            },
            responsiveness: {
                layoutAdaptation: result.layoutAdaptation,
                imageScaling: result.imageScaling,
                typographyScaling: result.typographyScaling,
                componentBehavior: result.componentBehavior,
                contentRearrangement: result.contentRearrangement,
                horizontalScroll: result.layout.horizontalScroll
            },
            score: result.scores.responsive
        },
        mobileOptimization: {
            viewport: result.viewportAnalysis,
            mobileFriendly: {
                tapTargets: result.tapTargets,
                fontScaling: result.typography,
                contentWidth: {
                    fitsViewport: !result.layout.horizontalScroll,
                    overflow: result.layout.horizontalScroll ? 'horizontal' : 'none',
                    horizontalScroll: result.layout.horizontalScroll,
                    maxContentWidth: result.contentMeasurements.maxContentWidth
                },
                loadingSpeed: {
                    firstContentfulPaint: `${(performanceMetrics.firstContentfulPaint / 1000).toFixed(1)}s`,
                    timeToInteractive: `${(performanceMetrics.timeToInteractive / 1000).toFixed(1)}s`,
                    score: performanceMetrics.firstContentfulPaint < 2000 ? 85 : performanceMetrics.firstContentfulPaint < 3000 ? 60 : 30
                }
            },
            score: result.scores.mobile
        },
        touchFriendly: {
            tapTargets: result.tapTargets,
            touchGestures: {
                swipeNavigation: result.touchBehavior.swipeNav,
                pinchZoom: result.viewportAnalysis.userScalable,
                doubleTapZoom: result.viewportAnalysis.userScalable,
                longPressSupport: result.touchBehavior.longPress,
                gestureConflicts: result.touchBehavior.gestureConflicts
            },
            scrollBehavior: {
                smoothScrolling: result.scrollBehavior.smoothScrolling,
                momentumScrolling: result.scrollBehavior.momentumScrolling,
                scrollSnap: result.scrollBehavior.scrollSnap,
                overscrollBehavior: result.scrollBehavior.overscrollBehavior
            },
            zoomSupport: {
                pinchToZoom: result.viewportAnalysis.userScalable,
                doubleTapZoom: result.viewportAnalysis.userScalable,
                maximumScale: result.touchBehavior.maxScale,
                viewportRestrictions: result.viewportAnalysis.content.includes('maximum-scale')
            },
            feedback: {
                touchHighlights: result.touchBehavior.touchHighlight,
                activeStates: result.touchBehavior.activeStates,
                visualFeedback: result.touchBehavior.activeStates ? 'immediate' : 'none',
                hapticFeedback: 'device-dependent'
            },
            score: result.scores.touch
        }
        // performance: {
        //     coreWebVitals: {
        //         lcp: `${(performanceMetrics.largestContentfulPaint / 1000).toFixed(1)}s`,
        //         fid: `${estimatedFID}ms`,
        //         cls: performanceMetrics.cumulativeLayoutShift.toFixed(3),
        //         inp: `${estimatedINP}ms`
        //     },
        //     loading: {
        //         timeToFirstByte: `${performanceMetrics.timeToFirstByte}ms`,
        //         firstContentfulPaint: `${(performanceMetrics.firstContentfulPaint / 1000).toFixed(1)}s`,
        //         largestContentfulPaint: `${(performanceMetrics.largestContentfulPaint / 1000).toFixed(1)}s`,
        //         speedIndex: `${(speedIndex / 1000).toFixed(1)}s`
        //     }
        // }
    };

    return finalResult;
}

async function closeBrowser(ctx: AnalyzerContext): Promise<void> {
    if (ctx.browser) {
        await ctx.browser.close();
        ctx.browser = null;
        ctx.page = null;
    }
}

function getRating(score: number): string {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 60) return 'Fair';
    if (score >= 40) return 'Poor';
    return 'Critical';
}

function generateRecommendations(analysisData: AnalysisResult): string[] {
    const recommendations: string[] = [];

    if (!analysisData.mobileOptimization.viewport.isProperlyConfigured) {
        recommendations.push('Add proper viewport meta tag: <meta name="viewport" content="width=device-width, initial-scale=1">');
    }

    if (analysisData.mobileOptimization.mobileFriendly.tapTargets.issues.length > 0) {
        recommendations.push(`Fix ${analysisData.mobileOptimization.mobileFriendly.tapTargets.issues.length} tap targets that are smaller than 44x44px`);
    }

    if (!analysisData.accessibilityDesign.viewports.fluidLayout) {
        recommendations.push('Implement fluid layout using percentage-based or viewport-relative units');
    }

    if (analysisData.accessibilityDesign.viewports.mediaQueries.count < 3) {
        recommendations.push('Add more media queries to support different screen sizes');
    }

    if (!analysisData.touchFriendly.zoomSupport.pinchToZoom) {
        recommendations.push('Enable pinch-to-zoom by removing user-scalable=no from viewport');
    }

    if (analysisData.mobileOptimization.mobileFriendly.contentWidth.horizontalScroll) {
        recommendations.push('Fix horizontal scrolling issues - content should fit within viewport');
    }

    if (analysisData.accessibilityDesign.viewports.gridSystem === 'Traditional') {
        recommendations.push('Consider using CSS Grid or Flexbox for better responsive layouts');
    }

    if (parseFloat(analysisData.mobileOptimization.mobileFriendly.fontScaling.baseSize) < 16) {
        recommendations.push('Increase base font size to at least 16px for better mobile readability');
    }

    if (recommendations.length === 0) {
        recommendations.push('Great job! Your site is well optimized for accessibility and mobile devices.');
    }

    return recommendations;
}



// API Route Handler
export async function analyzeMobileHandler(req: any, res: any) {
    const startTime = Date.now();
    
   
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ 
                success: false, 
                error: 'URL is required in request body',
                example: { url: 'https://example.com' }
            });
        }

        // try {
        //     new URL(url);
        // } catch {
        //     return res.status(400).json({ 
        //         success: false, 
        //         error: 'Invalid URL format. Must include protocol (http:// or https://)',
        //         example: { url: 'https://example.com' }
        //     });
        // }

        console.log(`[${new Date().toISOString()}] Analyzing: ${url}`);

        const analysis = await analyzeMobileAccessibility(url);
        
        const analysisWithUrl = {
            ...analysis,
            url: url
        };
        
        // console.log(analysisWithUrl);
        await appendAnalyzeState(url,analysisWithUrl);
        const geminiIssues = await generateSeoIssues(analysisWithUrl);


        const processingTime = Date.now() - startTime;
        
        const overallScore = Math.round(
            (analysis.accessibilityDesign.score + 
             analysis.mobileOptimization.score + 
             analysis.touchFriendly.score) / 3
        );

        console.log(`[${new Date().toISOString()}] Analysis complete in ${processingTime}ms`);

        res.json({ 
            success: true,
            url: url,
            timestamp: new Date().toISOString(),
            processingTime: `${processingTime}ms`,
            
            summary: {
                overallScore: overallScore,
                accessibilityScore: analysis.accessibilityDesign.score,
                mobileScore: analysis.mobileOptimization.score,
                touchScore: analysis.touchFriendly.score,
                rating: getRating(overallScore)
            },

            analysis: analysis,

            insights: {
                viewport: {
                    configured: analysis.mobileOptimization.viewport.isProperlyConfigured,
                    content: analysis.mobileOptimization.viewport.content,
                    issues: analysis.mobileOptimization.viewport.issues
                },
                accessibility: {
                    approach: analysis.accessibilityDesign.viewports.mediaQueries.approach,
                    breakpoints: Object.keys(analysis.accessibilityDesign.viewports.breakpoints).length,
                    fluidLayout: analysis.accessibilityDesign.viewports.fluidLayout,
                    gridSystem: analysis.accessibilityDesign.viewports.gridSystem
                },
                mobile: {
                    tapTargetIssues: analysis.mobileOptimization.mobileFriendly.tapTargets.issues.length,
                    fontSize: analysis.mobileOptimization.mobileFriendly.fontScaling.baseSize,
                    readability: analysis.mobileOptimization.mobileFriendly.fontScaling.readability,
                    horizontalScroll: analysis.mobileOptimization.mobileFriendly.contentWidth.horizontalScroll
                },
                touch: {
                    zoomEnabled: analysis.touchFriendly.zoomSupport.pinchToZoom,
                    smoothScrolling: analysis.touchFriendly.scrollBehavior.smoothScrolling,
                    scrollSnap: analysis.touchFriendly.scrollBehavior.scrollSnap
                },
                // performance: {
                //     lcp: analysis.performance.coreWebVitals.lcp,
                //     fcp: analysis.performance.loading.firstContentfulPaint,
                //     cls: analysis.performance.coreWebVitals.cls,
                //     ttfb: analysis.performance.loading.timeToFirstByte
                // }
            },

            recommendations: generateRecommendations(analysis),
            issues: geminiIssues
        });

   
}

export { analyzeMobileAccessibility, createAnalyzerContext, closeBrowser };
export type {
    AnalysisResult,
    PerformanceMetrics,
    ViewportMeta,
    MediaQueries,
    Responsiveness,
    TapTargets,
    AnalyzerContext
};