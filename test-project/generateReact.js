const { createReactComponentGenerator } = require('@teleporthq/teleport-code-generators');

// define a UIDL representation
const componentUIDL = require(process.env.UIDL_PATH);

const run = async () => {
    // instantiate a generator, selecting the styled-jsx plugin for handling styles (other options: CSSModules, JSS, InlineStyles)
    const reactGenerator = createReactComponentGenerator({ variation: 'StyledJSX' });

    // get the code
    try {
        const result = await reactGenerator.generateComponent(componentUIDL);
        console.log(result.code);
    } catch (error) {
        throw error;
    }
};

run();
