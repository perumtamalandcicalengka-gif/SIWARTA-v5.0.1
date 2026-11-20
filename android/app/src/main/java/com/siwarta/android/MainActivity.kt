package com.siwarta.android

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    private lateinit var root: LinearLayout
    private lateinit var webView: WebView
    private lateinit var progress: ProgressBar
    private val prefs by lazy { getSharedPreferences("siwarta", MODE_PRIVATE) }
    private val defaultWebAppUrl = "https://script.google.com/macros/s/AKfycbwiS8ImuVUeL01JKJlCKUyIQseV9y1hE66CvoajSKD8Pwg5BrSN5SHi_UQTPYcKqRxo/exec"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val savedUrl = prefs.getString("web_app_url", defaultWebAppUrl) ?: defaultWebAppUrl
        showWebApp(savedUrl)
    }

    private fun showSetup() {
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(28, 28, 28, 28)
        }
        val title = TextView(this).apply {
            text = "SIWARTA"
            textSize = 28f
            gravity = Gravity.CENTER
        }
        val description = TextView(this).apply {
            text = "Masukkan URL Web App Google Apps Script SIWARTA yang sudah di-deploy."
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(0, 12, 0, 18)
        }
        val urlInput = EditText(this).apply {
            hint = "https://script.google.com/macros/s/.../exec"
            setSingleLine(true)
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                android.text.InputType.TYPE_TEXT_VARIATION_URI
        }
        val openButton = Button(this).apply {
            text = "Simpan dan Buka SIWARTA"
            setOnClickListener {
                val url = urlInput.text.toString().trim()
                if (!url.startsWith("https://script.google.com/") || !url.endsWith("/exec")) {
                    Toast.makeText(this@MainActivity, "Masukkan URL Web App SIWARTA yang valid.", Toast.LENGTH_LONG).show()
                } else {
                    prefs.edit().putString("web_app_url", url).apply()
                    showWebApp(url)
                }
            }
        }
        root.addView(title, matchWidth())
        root.addView(description, matchWidth())
        root.addView(urlInput, matchWidth())
        root.addView(openButton, matchWidth())
        setContentView(root)
    }

    private fun showWebApp(url: String) {
        root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            visibility = View.GONE
        }
        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.loadsImagesAutomatically = true
        webView.settings.javaScriptCanOpenWindowsAutomatically = true
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val target = request.url
                return if (target.scheme == "https" &&
                    (target.host == "script.google.com" || target.host == "script.googleusercontent.com" ||
                     target.host == "accounts.google.com")) {
                    false
                } else {
                    try {
                        startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, target))
                    } catch (_: Exception) {
                        Toast.makeText(this@MainActivity, "Tautan tidak dapat dibuka.", Toast.LENGTH_SHORT).show()
                    }
                    true
                }
            }
        }
        root.addView(progress, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 6
        ))
        root.addView(webView, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f
        ))
        setContentView(root)
        webView.loadUrl(url)
    }

    private fun matchWidth() = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
    ).apply { bottomMargin = 12 }

    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }
}
