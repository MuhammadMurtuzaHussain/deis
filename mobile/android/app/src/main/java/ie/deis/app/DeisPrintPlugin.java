package ie.deis.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// window.print() does nothing in an Android WebView. This opens the system print dialog on
// the current page, with its print styles, where Save as PDF is one of the printers.
@CapacitorPlugin(name = "DeisPrint")
public class DeisPrintPlugin extends Plugin {
    @PluginMethod
    public void print(PluginCall call) {
        String name = call.getString("name", "Deis");
        getActivity().runOnUiThread(() -> {
            PrintManager printer = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
            if (printer == null) {
                call.reject("Printing isn't available on this phone.");
                return;
            }
            PrintAttributes attrs = new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build();
            printer.print(name, getBridge().getWebView().createPrintDocumentAdapter(name), attrs);
            call.resolve(new JSObject());
        });
    }
}
