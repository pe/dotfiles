function _tide_item_openshift
    set -l context (oc project -q 2>/dev/null) && _tide_print_item openshift $tide_openshift_icon' ' $context
end
